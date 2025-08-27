// === Enhancer v2.6 — spinner-gated, persistent, with colored summary ===
const ENHANCER_VERSION = '2.6';
const valueClass = '.field-value-min';
const propertyItemClass = '.table-row-min';
const SPINNER_SEL = 'span.u-Processing[role="alert"]';

const worstLocations = [...new Set(['Lochend','Inch','West Pilton','Granton','Muirhouse','Clermiston/Parkgrove','Greendykes','Royston Mains','Southhouse/Burdiehous','Restalrig','Milton','Dumbryden','Calders','Hyvots','Hailesland','Murrayburn','Saughton Mains','Prestonfield','Craigmillar','Niddrie','Moredun','Gilmerton','Gracemount','Bingham, Magdalene and The Christians','Stenhouse','Saughton','Broomhouse','Wester Hails','Wester Hailes','Westburn'])];
const quiteBadLocations = ['Leith'];
const roomTypeFilterArr = ['Two'];
const propertyFilteredTypesArr = ['Mover','Either Starter or Mover']; // green highlight
const removeWhenArr = ['Aged 60 and over','Sheltered','Aged 50 and over','Preferably aged 60 and over','Preferably aged 50 and over','Dispersed alarm'];
const warningArr = ['Fourth','Multi storey flat'];
const notTheBestLevelArr = ['Basement','Ground'];

// --- Styles ---
(function injectStyles(){
  const css = `
    ${propertyItemClass}{transition:background-color .2s ease,border-color .2s ease,opacity .2s ease}
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

    #enhancer-summary{margin:.6rem 0 0 0;display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
    #enhancer-summary .chip{display:inline-flex;align-items:center;gap:.4rem;padding:.2rem .5rem;border-radius:999px;border:1px solid #ccc;font:600 12px/1 system-ui,Segoe UI,Roboto,Arial;background:#fff}
    .chip .dot{width:.75rem;height:.75rem;border-radius:50%}
    .dot--green{background:#c8f7c5}
    .dot--red{background:#f5b7b1;border:1px solid #e74c3c}
    .dot--orange{background:#ffd59f}
    .dot--warn{background:#fff;border:2px solid #f7d674;border-radius:50%}
    .dot--hidden{background:#eee}
  `;
  if(!document.getElementById('row-style-injected')){
    const s=document.createElement('style'); s.id='row-style-injected'; s.textContent=css; document.head.appendChild(s);
  }
})();

$(function(){
  let enhancerEnabled = true;
  let moRows = null;
  let moSpinner = null;

  let lastSignature = '';
  let spinnerEverSeen = false;
  let spinnerVisible = false;
  let pendingApply = false;

  const MUST_SEE_SPINNER_FIRST = true;
  const STABLE_WINDOW_MS = 600;

  // --- UI: toggle + status + summary ---
  function ensureHeaderControls(){
    const $h = $('h1.page-header');
    if(!$h.length) return;
    if(!$('#enhancer-toggle').length){
      $('<button id="enhancer-toggle" type="button" class="enhancer-toggle" aria-pressed="true" title="Enable/disable enhancer">Enhancer: ON</button>')
        .appendTo($h)
        .on('click', () => {
          enhancerEnabled = !enhancerEnabled;
          $('#enhancer-toggle').attr('aria-pressed', String(enhancerEnabled)).text(`Enhancer: ${enhancerEnabled ? 'ON' : 'OFF'}`);
          updateStatus(enhancerEnabled ? 'busy' : 'off', '—');
          if (enhancerEnabled){ attachObservers(); gatedApply(true); }
          else { detachObservers(); clearStyles(true); renderSummary({}); }
        });
    }
    if(!$('#enhancer-status').length){
      $('<span id="enhancer-status" class="enhancer-status enhancer-status--busy" title="Enhancer status">↻ Waiting…</span>').appendTo($h);
    }
    if(!$('#enhancer-summary').length){
      $('<div id="enhancer-summary" aria-live="polite"></div>').insertAfter($h);
    }
  }
  function updateStatus(state, note){
    const $s = $('#enhancer-status');
    if(!$s.length) return;
    $s.removeClass('enhancer-status--ok enhancer-status--busy enhancer-status--off');
    if(state==='ok'){ $s.addClass('enhancer-status--ok').text(`✓ Stabilized ${note||''}`); }
    else if(state==='busy'){ $s.addClass('enhancer-status--busy').text(`↻ Updating… ${note||''}`); }
    else { $s.addClass('enhancer-status--off').text(`⏻ Off ${note||''}`); }
  }
  function renderSummary(stats){
    const $c = $('#enhancer-summary');
    if(!$c.length) return;
    const {total=0, green=0, worst=0, bad=0, warned=0, hidden=0} = stats || {};
    const html = `
      <span class="chip"><span class="dot dot--green"></span>Green (Mover/Either): ${green}</span>
      <span class="chip"><span class="dot dot--red"></span>Worst loc (red border if green): ${worst}</span>
      <span class="chip"><span class="dot dot--orange"></span>Quite bad loc: ${bad}</span>
      <span class="chip"><span class="dot dot--warn"></span>Warnings (level/storey): ${warned}</span>
      <span class="chip"><span class="dot dot--hidden"></span>Hidden/Removed: ${hidden}</span>
      <span class="chip">Total rows: ${total}</span>
    `;
    $c.html(html);
  }

  // --- Helpers ---
  const debounce = (fn, wait=150) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };
  const hash = (str) => { let h = 2166136261>>>0; for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0).toString(16); };
  const rowsSignature = () => {
    const chunks = [];
    $(propertyItemClass).each(function(){
      chunks.push($(this).text().replace(/\s+/g,' ').trim());
    });
    return hash(chunks.join('|'));
  };
  const isSpinnerNow = () => $(SPINNER_SEL).length > 0;

  function clearStyles(showHidden){
    const $rows = $(propertyItemClass);
    $rows.removeClass('row--green row--bad row--worst row--warn row--red-border row--hidden')
         .removeAttr('data-enhanced')
         .css({backgroundColor:'', border:'', opacity:''})
         .find(valueClass).css({color:''});
    if (showHidden) $rows.removeClass('row--hidden');
  }

  // --- Core classify/apply ---
  function classifyRow($row){
    const texts = $row.find(valueClass).map(function(){ return $(this).text().trim(); }).get();

    const roomTypeOk       = texts.some(t => roomTypeFilterArr.includes(t));
    const hasPropFiltered  = texts.some(t => propertyFilteredTypesArr.includes(t));  // green
    const isWorstPlace     = texts.some(t => worstLocations.includes(t));
    const isQuiteBadPlace  = texts.some(t => quiteBadLocations.includes(t));
    const levelWarn        = texts.some(t => notTheBestLevelArr.includes(t));
    const otherWarnings    = texts.some(t => warningArr.includes(t));

    const isStarterOnly    = texts.includes('Starter') && !texts.includes('Either Starter or Mover'); // strict
    const hasRemoveFlag    = texts.some(t => removeWhenArr.includes(t));
    const removeThis       = isStarterOnly || hasRemoveFlag;

    return {roomTypeOk, hasPropFiltered, isWorstPlace, isQuiteBadPlace, levelWarn, otherWarnings, removeThis};
  }

  function applyStyles($row, cls){
    $row.removeClass('row--green row--bad row--worst row--warn row--red-border row--hidden')
        .css({backgroundColor:'', border:'', opacity:''})
        .attr('data-enhanced', ENHANCER_VERSION);
    $row.find(valueClass).css({color:''});

    if (cls.removeThis || !cls.roomTypeOk) { $row.addClass('row--hidden'); return; }

    if (cls.hasPropFiltered) {
      $row.addClass('row--green');
      if (cls.isWorstPlace) $row.addClass('row--red-border'); // green + red border
    }

    if (cls.isWorstPlace && !cls.hasPropFiltered) {
      $row.addClass('row--worst');
    } else if (cls.isQuiteBadPlace && !cls.hasPropFiltered) {
      $row.addClass('row--bad');
    }

    if (cls.levelWarn || cls.otherWarnings) {
      $row.addClass('row--warn');
    }
  }

  function runCheck(force=false){
    if(!enhancerEnabled) return;

    const $rows = $(propertyItemClass);
    if (!$rows.length) { renderSummary({total:0,green:0,worst:0,bad:0,warned:0,hidden:0}); return; }

    const removeOnThisPage = $('.page-header').length && ['Basket','Bid Registration'].includes($('.page-header').text().trim());
    if (removeOnThisPage){ clearStyles(true); updateStatus('ok', '(skipped on this page)'); renderSummary({}); return; }

    let total=0, hidden=0, green=0, worst=0, bad=0, warned=0;

    $rows.each(function(){
      const $row = $(this);
      const cls = classifyRow($row);
      applyStyles($row, cls);

      total++;
      if (cls.removeThis || !cls.roomTypeOk) hidden++;
      if (cls.hasPropFiltered) green++;
      if (cls.isWorstPlace && !cls.hasPropFiltered) worst++;
      if (cls.isQuiteBadPlace && !cls.hasPropFiltered) bad++;
      if (cls.levelWarn || cls.otherWarnings) warned++;
    });

    // update colored summary immediately after styling
    renderSummary({total, hidden, green, worst, bad, warned});

    const sig = rowsSignature();
    if (force || sig !== lastSignature){
      lastSignature = sig;
      scheduleVerify();
    }
  }

  // --- Spinner-gated orchestrator ---
  function gatedApply(force=false){
    if(!enhancerEnabled) return;

    spinnerVisible = isSpinnerNow();
    if (spinnerVisible){
      pendingApply = true;
      updateStatus('busy', '(processing…)');
      return;
    }
    if (MUST_SEE_SPINNER_FIRST && !spinnerEverSeen){
      updateStatus('busy', '(waiting for first spinner…)');
      return;
    }
    updateStatus('busy', '(applying…)');
    setTimeout(()=> runCheck(force), STABLE_WINDOW_MS);
  }

  // --- Persistence verifier ---
  function verifyNow(){
    if(!enhancerEnabled) return;
    if (isSpinnerNow()){ updateStatus('busy', '(processing…)'); return; }

    const $rows = $(propertyItemClass);
    let ok=0, expect=0;
    $rows.each(function(){
      const $row = $(this);
      const cls = classifyRow($row);
      expect++;
      const hasMark = $row.attr('data-enhanced') === ENHANCER_VERSION;
      const classesOk =
        (cls.removeThis || !cls.roomTypeOk ? $row.hasClass('row--hidden') : true) &&
        (!cls.removeThis && cls.hasPropFiltered ? $row.hasClass('row--green') : true) &&
        (!cls.removeThis && cls.isWorstPlace && cls.hasPropFiltered ? $row.hasClass('row--red-border') : true);
      if (hasMark && classesOk) ok++;
    });
    const pct = expect ? Math.round((ok/expect)*100) : 100;

    if (pct >= 95){
      updateStatus('ok', `(v${ENHANCER_VERSION} • ${pct}% verified)`);
    } else {
      updateStatus('busy', `(reapplying; ${pct}% ok)`);
      runCheck();
      scheduleVerify();
    }
  }
  const scheduleVerify = debounce(()=>verifyNow(), STABLE_WINDOW_MS);
  const debouncedGatedApply = debounce(()=>gatedApply(), 120);

  // --- Observers ---
  function detachObservers(){
    if(moRows){ moRows.disconnect(); moRows=null; }
    if(moSpinner){ moSpinner.disconnect(); moSpinner=null; }
  }
  function attachObservers(){
    const container = document.querySelector('.table-container') || document.body;
    if (moRows) moRows.disconnect();
    moRows = new MutationObserver((mutations) => {
      const relevant = mutations.some(m => m.type==='childList' || m.type==='characterData');
      if (relevant) debouncedGatedApply();
    });
    moRows.observe(container, {childList:true,subtree:true,characterData:true});

    if (moSpinner) moSpinner.disconnect();
    moSpinner = new MutationObserver(() => {
      const visible = isSpinnerNow();
      if (visible){
        spinnerVisible = true;
        spinnerEverSeen = true;
        updateStatus('busy', '(processing…)');
      } else {
        // SPINNER REMOVED/HIDDEN: attach updated content NOW
        spinnerVisible = false;
        if (pendingApply || spinnerEverSeen){
          pendingApply = false;
          gatedApply(true);       // apply styles + render colored list after spinner hides
        }
      }
    });
    moSpinner.observe(document.body, {childList:true,subtree:true,attributes:true,attributeFilter:['style','class']});
  }

  // --- Init ---
  ensureHeaderControls();
  attachObservers();
  updateStatus('busy', `(v${ENHANCER_VERSION})`);

  // Do not run until spinner appears and disappears at least once
  if (!MUST_SEE_SPINNER_FIRST) gatedApply(true);

  // Pagination hook
  $('#body-primary-region').on('click', 'td.pagination div.pagination a', function () {
    if (enhancerEnabled){ updateStatus('busy'); gatedApply(); }
  });
});
