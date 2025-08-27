// === Enhancer v3.0 — spinner-gated, ON/OFF persisted, auto-reload on toggle, 10s cutoff to "Not detected" ===
/* Requirements addressed:
   - Toggle persists to localStorage/cookie and reloads page on change.
   - On reload: if OFF → do nothing; if ON → apply normally.
   - Spinner gating: wait until the spinner APPEARS at least once, then until it DISAPPEARS, then apply.
   - If spinner never appears within 10s → stop any loops, set status "Not detected", apply once.
   - No "↻ Waiting…" message; no noisy "retrying..." logs; loops hard-stop at 10s without spinner.
*/

const ENHANCER_VERSION = '3.0';
const DEBUG = true; // set to false to silence all logs

// ---------------- Selectors / Config ----------------
const SPINNER_SEL = 'span.u-Processing[role="alert"]';
const TABLE_CONTAINER_SEL = '.table-container';
const ROW_SEL = '.table-row-min';
const VAL_SEL = '.field-value-min';

const worstLocations = [...new Set(['Lochend','Inch','West Pilton','Granton','Muirhouse','Clermiston/Parkgrove','Greendykes','Royston Mains','Southhouse/Burdiehous','Restalrig','Milton','Dumbryden','Calders','Hyvots','Hailesland','Murrayburn','Saughton Mains','Prestonfield','Craigmillar','Niddrie','Moredun','Gilmerton','Gracemount','Bingham, Magdalene and The Christians','Stenhouse','Saughton','Broomhouse','Wester Hails','Wester Hailes','Westburn'])];
const quiteBadLocations = ['Leith'];
const roomTypeFilterArr = ['Two'];
const propertyFilteredTypesArr = ['Mover','Either Starter or Mover']; // → green
const removeWhenArr = ['Aged 60 and over','Sheltered','Aged 50 and over','Preferably aged 60 and over','Preferably aged 50 and over','Dispersed alarm'];
const warningArr = ['Fourth','Multi storey flat'];
const notTheBestLevelArr = ['Basement','Ground'];

// ---------------- Timing / gating ----------------
const REQUIRE_SPINNER_FIRST = true;       // must see spinner at least once before first apply
const POLL_MS = 250;                      // poll interval
const STABLE_MS = 400;                    // settle time after spinner hides
const SPINNER_STUCK_MAX_MS = 10000;       // if spinner visible > this → force apply
const NOT_DETECTED_TIMEOUT_MS = 10000;    // if spinner never appears in this window → "Not detected" + apply

// ---------------- Storage helpers ----------------
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

// ---------------- Styles (one-time) ----------------
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

// ---------------- Debug ----------------
const log = (...a)=>{ if(DEBUG) console.log('[Enhancer v'+ENHANCER_VERSION+']', ...a); };

// ---------------- Spinner visibility ----------------
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

// ---------------- Header controls ----------------
function setStatus(state, note){
  const s = document.getElementById('enhancer-status'); if(!s) return;
  s.className = 'enhancer-status';
  if(state==='ok'){ s.classList.add('enhancer-status--ok'); s.textContent='✓ Stabilized '+(note||''); }
  else if(state==='busy'){ s.classList.add('enhancer-status--busy'); s.textContent='↻ Updating… '+(note||''); }
  else if(state==='notdetected'){ s.classList.add('enhancer-status--notdetected'); s.textContent='Not detected '+(note||''); }
  else { s.classList.add('enhancer-status--off'); s.textContent='⏻ Off '+(note||''); }
}
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
    const newVal = !enhancer.enabled;                  // true/false
    storageSet(STORAGE_KEY, newVal ? '1':'0');         // persist as '1'/'0'
    log('Toggle ->', newVal, '(saved → reload)');
    location.reload();                                  // hard reload after saving
  };

  // Status (no "Waiting…" text is used anywhere)
  let s = document.getElementById('enhancer-status');
  if(!s){
    s = document.createElement('span');
    s.id='enhancer-status';
    h.appendChild(s);
  }
  if (enhancer.enabled) setStatus('busy', `(v${ENHANCER_VERSION})`);
  else setStatus('off', `(v${ENHANCER_VERSION})`);
}

// ---------------- Classify + Apply ----------------
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
function applyEnhancements(source){
  const container = document.querySelector(TABLE_CONTAINER_SEL);
  const rows = document.querySelectorAll(ROW_SEL);
  if (!container || !rows.length){ log('applyEnhancements: nothing to do', {hasContainer:!!container, rows:rows.length}); return; }
  log('applyEnhancements from', source, 'rows =', rows.length);
  rows.forEach(row=> applyStyles(row, classifyRow(row)) );
  setStatus('ok', `(v${ENHANCER_VERSION})`);
}

// ---------------- Spinner gate (single interval; 10s cutoff) ----------------
const enhancer = {
  enabled: (storageGet(STORAGE_KEY, null) === null ? true : storageGet(STORAGE_KEY) === '1'),
  pollId: null,
  stuckId: null,
  cutoffId: null,
  seenSpinnerOnce: false,
  applying: false
};

function stopAllTimers(){
  if (enhancer.pollId){ clearInterval(enhancer.pollId); enhancer.pollId = null; }
  if (enhancer.stuckId){ clearTimeout(enhancer.stuckId); enhancer.stuckId = null; }
  if (enhancer.cutoffId){ clearTimeout(enhancer.cutoffId); enhancer.cutoffId = null; }
}

function safeApply(reason){
  if (!enhancer.enabled) return;
  if (enhancer.applying) return;
  if (spinnerVisible()) return; // only apply when spinner is hidden/removed
  enhancer.applying = true;
  stopAllTimers();
  try { applyEnhancements(reason); }
  finally {
    enhancer.applying = false;
    // re-arm for future content loads (pagination, etc.)
    setTimeout(()=>startGate('post-apply'), 0);
  }
}

function startGate(trigger){
  if (!enhancer.enabled) return;

  stopAllTimers();

  const startTs = Date.now();
  const container = document.querySelector(TABLE_CONTAINER_SEL);

  // If container is missing, we still honor the 10s cutoff without spamming logs.
  let lastVisible = spinnerVisible();

  // 10s overall cutoff if spinner never appears
  enhancer.cutoffId = setTimeout(()=>{
    if (!enhancer.seenSpinnerOnce && enhancer.enabled){
      log('Spinner not detected within 10s → Not detected + apply');
      setStatus('notdetected', `(v${ENHANCER_VERSION})`);
      enhancer.seenSpinnerOnce = true; // allow path
      safeApply('not-detected');
    }
  }, NOT_DETECTED_TIMEOUT_MS);

  // If spinner visible at start, arm stuck safety (10s)
  if (lastVisible){
    enhancer.seenSpinnerOnce = true;
    enhancer.stuckId = setTimeout(()=>{
      if (spinnerVisible()){
        log('Spinner stuck >10s → force apply');
        safeApply('spinner-stuck');
      }
    }, SPINNER_STUCK_MAX_MS);
  }

  // Single polling loop (no console spam, no "retrying..." logs)
  enhancer.pollId = setInterval(()=>{
    // Stop if cutoff time exceeded and already handled
    if (Date.now() - startTs > NOT_DETECTED_TIMEOUT_MS + 1000){
      stopAllTimers();
      return;
    }

    // Require table container present before doing anything else; respect 10s cutoff
    const hasContainer = !!document.querySelector(TABLE_CONTAINER_SEL);
    if (!hasContainer) return; // silently wait; cutoff timer handles Not detected

    const vis = spinnerVisible();
    if (vis !== lastVisible){
      lastVisible = vis;
      if (vis){
        enhancer.seenSpinnerOnce = true;
        // re-arm stuck safety on each appearance
        if (enhancer.stuckId) clearTimeout(enhancer.stuckId);
        enhancer.stuckId = setTimeout(()=>{
          if (spinnerVisible()){
            log('Spinner stuck >10s → force apply');
            safeApply('spinner-stuck');
          }
        }, SPINNER_STUCK_MAX_MS);
      } else {
        // spinner disappeared → apply after small settle window
        setTimeout(()=> safeApply('spinner-hidden'), STABLE_MS);
      }
    }
  }, POLL_MS);
}

// ---------------- Init + hooks ----------------
(function init(){
  // Build header UI and reflect persisted state
  ensureHeaderControls();

  if (!enhancer.enabled){
    log('Enhancer OFF (persisted). Idle.');
    return; // do not apply, do not start gate
  }

  log('Enhancer ON. Starting gate.');
  startGate('init');

  // Pagination hook (jQuery optional)
  if (window.jQuery){
    jQuery('#body-primary-region').on('click', 'td.pagination div.pagination a', function () {
      if (!enhancer.enabled) return;
      setStatus('busy', `(v${ENHANCER_VERSION})`);
      startGate('pagination');
    });
  }
})();
