```javascript
// === Enhancer v2.9 — spinner-gated, persistent ON/OFF, auto-reload on toggle, "Not detected" status, debug logs ===
const ENHANCER_VERSION = '2.9';
const DEBUG = true;

// Selectors
const SPINNER_SEL = 'span.u-Processing[role="alert"]';
const TABLE_CONTAINER_SEL = '.table-container';
const ROW_SEL = '.table-row-min';
const VAL_SEL = '.field-value-min';

// Config
const worstLocations = [...new Set(['Lochend','Inch','West Pilton','Granton','Muirhouse','Clermiston/Parkgrove','Greendykes','Royston Mains','Southhouse/Burdiehous','Restalrig','Milton','Dumbryden','Calders','Hyvots','Hailesland','Murrayburn','Saughton Mains','Prestonfield','Craigmillar','Niddrie','Moredun','Gilmerton','Gracemount','Bingham, Magdalene and The Christians','Stenhouse','Saughton','Broomhouse','Wester Hails','Wester Hailes','Westburn'])];
const quiteBadLocations = ['Leith'];
const roomTypeFilterArr = ['Two'];
const propertyFilteredTypesArr = ['Mover','Either Starter or Mover']; // highlight green
const removeWhenArr = ['Aged 60 and over','Sheltered','Aged 50 and over','Preferably aged 60 and over','Preferably aged 50 and over','Dispersed alarm'];
const warningArr = ['Fourth','Multi storey flat'];
const notTheBestLevelArr = ['Basement','Ground'];

// Gating
const REQUIRE_SPINNER_FIRST = true;     // wait until spinner appears at least once
const POLL_MS = 250;                    // spinner poll interval
const STABLE_MS = 400;                  // settle time after spinner hides
const SPINNER_STUCK_MAX_MS = 10000;     // force apply if spinner stuck visible
const NOT_DETECTED_TIMEOUT_MS = 10000;  // label "Not detected" and apply if spinner never appears

// Storage helpers (localStorage with cookie fallback)
const STORAGE_KEY = 'enhancerEnabled';
function storageSet(k, v){
  try { localStorage.setItem(k, v); }
  catch(e){ document.cookie = `${encodeURIComponent(k)}=${encodeURIComponent(v)};path=/;max-age=31536000`; }
}
function storageGet(k, dflt=null){
  try {
    const v = localStorage.getItem(k);
    if (v !== null) return v;
  } catch(e){}
  const m = document.cookie.match(new RegExp('(?:^|; )'+k.replace(/([.*+?^${}()|[\]\\])/g,'\\$1')+'=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : dflt;
}

// Styles (one-time)
(function injectStyles(){
  const css = `
    ${ROW_SEL}{transition:background-color .2s ease,border-color .2s ease,opacity .2s ease}
    .row--green{background:#c8f7c5}
    .row--bad{background:#ffd59f}
    .row--worst{background:#f5b7b1;opacity:.75}
    .row--warn{border:3px solid #f7d674}
    .row--red-border{border:3px solid #e74c3c}
    .row--hidden{display:none !important}
    .enhancer-toggle{margin-left:.5rem;font:600 12px/1.2 system-ui,Segoe UI,Roboto,Arial;padding:.35rem .6rem;border-radius:6px;border:1px solid #bbb;background:#f5f5f5;cursor:pointer}
    .enhancer-toggle[aria-pressed="true"]{background:#e9fbe7;border-color:#7ec87a}
    .enhancer-toggle[aria-pressed="false"]{background:#f7e9e9;border-color:#e07979}
    .enhancer-status{margin-left:.4rem;font:600 12px/1.2 system-ui,Segoe UI,Roboto,Arial;padding:.25rem .5rem;border-radius:6px;border:1px solid #bbb;background:#fff}
    .enhancer-status--ok{border-color:#7ec87a}
    .enhancer-status--busy{border-color:#f4b942}
    .enhancer-status--off{border-color:#aaa;color:#777}
    .enhancer-status--notdetected{border-color:#d35400;color:#d35400}
  `;
  if(!document.getElementById('enhancer-style')){
    const s=document.createElement('style'); s.id='enhancer-style'; s.textContent=css; document.head.appendChild(s);
  }
})();

// Debug
const log = (...a)=>{ if(DEBUG) console.log('[Enhancer v'+ENHANCER_VERSION+']', ...a); };

// Spinner visibility (presence + visible)
function spinnerVisible(){
  const s = document.querySelectorAll(SPINNER_SEL);
  if(!s.length) return false;
  for (const el of s){
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display!=='none' && cs.visibility!=='hidden' && parseFloat(cs.opacity||'1')>0 && r.width>0 && r.height>0) return true;
  }
  return false;
}

// Header controls
function ensureHeaderControls(){
  const h = document.querySelector('h1.page-header');
  if(!h) return;
  // Toggle
  let btn = document.getElementById('enhancer-toggle');
  if(!btn){
    btn = document.createElement('button');
    btn.id='enhancer-toggle'; btn.type='button'; btn.className='enhancer-toggle';
    h.appendChild(btn);
  }
  btn.setAttribute('aria-pressed', String(enhancer.enabled));
  btn.textContent = 'Enhancer: ' + (enhancer.enabled ? 'ON' : 'OFF');
  btn.onclick = ()=>{
    const newVal = !enhancer.enabled;
    storageSet(STORAGE_KEY, newVal ? '1':'0');
    log('Toggle ->', newVal, '(persisted; reloading)');
    location.reload(); // reload on change
  };

  // Status
  let s = document.getElementById('enhancer-status');
  if(!s){
    s = document.createElement('span');
    s.id='enhancer-status';
    h.appendChild(s);
  }
  setStatus(enhancer.enabled ? 'busy' : 'off', enhancer.enabled ? '(v'+ENHANCER_VERSION+')' : '');
}
function setStatus(state, note){
  const s = document.getElementById('enhancer-status'); if(!s) return;
  s.className = 'enhancer-status'; // reset
  if(state==='ok'){ s.classList.add('enhancer-status--ok'); s.textContent='✓ Stabilized '+(note||''); }
  else if(state==='busy'){ s.classList.add('enhancer-status--busy'); s.textContent='↻ Updating… '+(note||''); }
  else if(state==='notdetected'){ s.classList.add('enhancer-status--notdetected'); s.textContent='Not detected '+(note||''); }
  else { s.classList.add('enhancer-status--off'); s.textContent='⏻ Off '+(note||''); }
}

// Classification + styling
function classifyRow(row){
  const texts = Array.from(row.querySelectorAll(VAL_SEL)).map(n=>n.textContent.trim());
  const roomTypeOk       = texts.some(t => roomTypeFilterArr.includes(t));
  const hasPropFiltered  = texts.some(t => propertyFilteredTypesArr.includes(t));
  const isWorstPlace     = texts.some(t => worstLocations.includes(t));
  const isQuiteBadPlace  = texts.some(t => quiteBadLocations.includes(t));
  const levelWarn        = texts.some(t => notTheBestLevelArr.includes(t));
  const otherWarnings    = texts.some(t => warningArr.includes(t));
  const isStarterOnly    = texts.includes('Starter') && !texts.includes('Either Starter or Mover');
  const hasRemoveFlag    = texts.some(t => removeWhenArr.includes(t));
  const removeThis       = isStarterOnly || hasRemoveFlag;
  return {roomTypeOk, hasPropFiltered, isWorstPlace, isQuiteBadPlace, levelWarn, otherWarnings, removeThis};
}
function applyStyles(row, c){
  row.classList.remove('row--green','row--bad','row--worst','row--warn','row--red-border','row--hidden');
  row.removeAttribute('data-enhanced');
  if (c.removeThis || !c.roomTypeOk){ row.classList.add('row--hidden'); return; }
  if (c.hasPropFiltered){
    row.classList.add('row--green');
    if (c.isWorstPlace) row.classList.add('row--red-border'); // green + red border
  }
  if (c.isWorstPlace && !c.hasPropFiltered) row.classList.add('row--worst');
  else if (c.isQuiteBadPlace && !c.hasPropFiltered) row.classList.add('row--bad');
  if (c.levelWarn || c.otherWarnings) row.classList.add('row--warn');
  row.setAttribute('data-enhanced', ENHANCER_VERSION);
}

// Core apply
function applyEnhancements(source){
  const container = document.querySelector(TABLE_CONTAINER_SEL);
  const rows = document.querySelectorAll(ROW_SEL);
  if (!container || !rows.length){ log('applyEnhancements: nothing to do', {hasContainer:!!container, rows:rows.length}); return; }
  log('applyEnhancements from', source, 'rows =', rows.length);
  let total=0, hidden=0, green=0, worst=0, bad=0, warned=0;
  rows.forEach(row=>{
    const c = classifyRow(row);
    applyStyles(row, c);
    total++;
    if (c.removeThis || !c.roomTypeOk) hidden++;
    if (c.hasPropFiltered) green++;
    if (c.isWorstPlace && !c.hasPropFiltered) worst++;
    if (c.isQuiteBadPlace && !c.hasPropFiltered) bad++;
    if (c.levelWarn || c.otherWarnings) warned++;
  });
  log('applied stats:', {total, hidden, green, worst, bad, warned});
  setStatus('ok', `(v${ENHANCER_VERSION})`);
}

// Spinner gate (single polling loop; no mutation loops)
const enhancer = {
  enabled: (storageGet(STORAGE_KEY, null) === null ? true : storageGet(STORAGE_KEY) === '1'),
  seenSpinnerOnce: false,
  pollId: null,
  stuckTimerId: null,
  notDetectedTimerId: null,
  applying: false
};

function stopPolling(){
  if (enhancer.pollId){ clearInterval(enhancer.pollId); enhancer.pollId = null; }
  if (enhancer.stuckTimerId){ clearTimeout(enhancer.stuckTimerId); enhancer.stuckTimerId = null; }
  if (enhancer.notDetectedTimerId){ clearTimeout(enhancer.notDetectedTimerId); enhancer.notDetectedTimerId = null; }
}

function watchSpinner(trigger){
  if (!enhancer.enabled) return;

  stopPolling();

  const container = document.querySelector(TABLE_CONTAINER_SEL);
  if (!container){ log('watchSpinner: no table container yet, retrying in 300ms'); setTimeout(()=>watchSpinner('container-wait'), 300); return; }

  log('watchSpinner start (trigger:', trigger, ') REQUIRE_SPINNER_FIRST =', REQUIRE_SPINNER_FIRST);
  setStatus('busy','(v'+ENHANCER_VERSION+')');

  // "Not detected" label + fallback apply if spinner never appears in time
  if (REQUIRE_SPINNER_FIRST && !enhancer.seenSpinnerOnce){
    enhancer.notDetectedTimerId = setTimeout(()=>{
      if (!enhancer.seenSpinnerOnce && enhancer.enabled){
        log('Spinner not detected within', NOT_DETECTED_TIMEOUT_MS,'ms -> label & apply');
        setStatus('notdetected', '(v'+ENHANCER_VERSION+')');
        enhancer.seenSpinnerOnce = true;   // allow apply path
        safeApply('not-detected');
      }
    }, NOT_DETECTED_TIMEOUT_MS);
  }

  let lastVisible = spinnerVisible();
  if (lastVisible){
    enhancer.seenSpinnerOnce = true;
    log('spinner visible at start; arming stuck-safety');
    enhancer.stuckTimerId = setTimeout(()=>{
      if (spinnerVisible()){
        log('spinner stuck >', SPINNER_STUCK_MAX_MS,'ms -> force apply');
        safeApply('spinner-stuck');
      }
    }, SPINNER_STUCK_MAX_MS);
  }

  enhancer.pollId = setInterval(()=>{
    const vis = spinnerVisible();
    if (vis !== lastVisible){
      lastVisible = vis;
      if (vis){
        enhancer.seenSpinnerOnce = true;
        setStatus('busy','(processing…)');
        log('spinner appeared');
        if (enhancer.stuckTimerId) clearTimeout(enhancer.stuckTimerId);
        enhancer.stuckTimerId = setTimeout(()=>{
          if (spinnerVisible()){
            log('spinner stuck >', SPINNER_STUCK_MAX_MS,'ms -> force apply');
            safeApply('spinner-stuck');
          }
        }, SPINNER_STUCK_MAX_MS);
      } else {
        // spinner disappeared -> apply after short settle
        log('spinner disappeared; applying after', STABLE_MS,'ms');
        setTimeout(()=> safeApply('spinner-hidden'), STABLE_MS);
      }
    }
  }, POLL_MS);
}

function safeApply(reason){
  if (!enhancer.enabled) return;
  if (enhancer.applying) { log('safeApply skipped; already applying'); return; }
  if (spinnerVisible()){ log('safeApply aborted; spinner visible'); return; }

  enhancer.applying = true;
  stopPolling();
  try {
    applyEnhancements(reason);
  } finally {
    enhancer.applying = false;
    // re-arm for future updates (e.g., pagination)
    setTimeout(()=>watchSpinner('post-apply'), 0);
  }
}

// Hooks
$(function(){
  ensureHeaderControls();

  if (enhancer.enabled){
    watchSpinner('init');
    // Pagination -> re-run spinner gate
    $('#body-primary-region').on('click', 'td.pagination div.pagination a', function () {
      if (!enhancer.enabled) return;
      log('pagination clicked -> re-gate');
      setStatus('busy','(v'+ENHANCER_VERSION+')');
      watchSpinner('pagination');
    });
  } else {
    setStatus('off', '(v'+ENHANCER_VERSION+')');
    log('Enhancer disabled via storage; idle.');
  }
});
```
