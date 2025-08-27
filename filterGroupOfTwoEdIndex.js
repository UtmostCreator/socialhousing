// === Config ===
const worstLocations = [...new Set(['Lochend','Inch','West Pilton','Granton','Muirhouse','Clermiston/Parkgrove','Greendykes','Royston Mains','Southhouse/Burdiehous','Restalrig','Milton','Dumbryden','Calders','Hyvots','Hailesland','Murrayburn','Saughton Mains','Prestonfield','Craigmillar','Niddrie','Moredun','Gilmerton','Gracemount','Bingham, Magdalene and The Christians','Stenhouse','Saughton','Broomhouse','Wester Hails','Wester Hailes','Westburn'])];
const quiteBadLocations = ['Leith'];

const valueClass = '.field-value-min';
const propertyItemClass = '.table-row-min';

const roomTypeFilterArr = ['Two'];
const propertyFilteredTypesArr = ['Mover','Either Starter or Mover']; // highlight green
const removeWhenArr = ['Aged 60 and over','Sheltered','Aged 50 and over','Preferably aged 60 and over','Preferably aged 50 and over','Dispersed alarm'];
const warningArr = ['Fourth','Multi storey flat'];
const notTheBestLevelArr = ['Basement','Ground'];

// === Styles (class-based, clearer than inline) ===
(function injectStyles(){
  const css = `
    ${propertyItemClass}{transition:background-color .2s ease,border-color .2s ease,opacity .2s ease}
    .row--green{background:#c8f7c5}
    .row--bad{background:#ffd59f}
    .row--worst{background:#f5b7b1;opacity:.75}
    .row--warn{border:3px solid #f7d674}
    .row--red-border{border:3px solid #e74c3c}
  `;
  if(!document.getElementById('row-style-injected')){
    const s=document.createElement('style'); s.id='row-style-injected'; s.textContent=css; document.head.appendChild(s);
  }
})();

$(document).ready(function () {
  function runCheck() {
    const $rows = $(propertyItemClass);
    if (!$rows.length) return;

    const removeOnThisPage = $('.page-header').length && ['Basket','Bid Registration'].includes($('.page-header').text().trim());

    $rows.each(function () {
      const $row = $(this);

      // collect all visible values once
      const texts = $row.find(valueClass).map(function(){ return $(this).text().trim(); }).get();

      const roomTypeOk       = texts.some(t => roomTypeFilterArr.includes(t));
      const hasPropFiltered  = texts.some(t => propertyFilteredTypesArr.includes(t)); // -> green
      const isWorstPlace     = texts.some(t => worstLocations.includes(t));
      const isQuiteBadPlace  = texts.some(t => quiteBadLocations.includes(t));
      const levelWarn        = texts.some(t => notTheBestLevelArr.includes(t));
      const otherWarnings    = texts.some(t => warningArr.includes(t));

      // removals: explicit "Starter" property OR any in removeWhenArr
      const isStarterOnly    = texts.includes('Starter'); // do NOT match "Either Starter or Mover"
      const hasRemoveFlag    = texts.some(t => removeWhenArr.includes(t));
      const removeThis       = isStarterOnly || hasRemoveFlag;

      // remove by filters
      if (((!roomTypeOk) || removeThis) && !removeOnThisPage) {
        $row.remove();
        return; // continue
      }

      // clear previous styles
      $row.removeClass('row--green row--bad row--worst row--warn row--red-border')
          .css({backgroundColor:'', border:'', opacity:''});

      // highlight rules
      if (hasPropFiltered) {
        $row.addClass('row--green');
        if (isWorstPlace) $row.addClass('row--red-border'); // green + red border
      }

      // location grading when not already marked worst+green
      if (isWorstPlace && !hasPropFiltered) {
        $row.addClass('row--worst');
      } else if (isQuiteBadPlace && !hasPropFiltered) {
        $row.addClass('row--bad');
      }

      // generic warnings (storey/level)
      if (levelWarn || otherWarnings) {
        $row.addClass('row--warn');
      }
    });

    $('html, body').animate({scrollTop: 0}, 'fast');
  }

  // run once and on pagination
  runCheck();

  // handle dynamic updates
  $('#body-primary-region').on('click', 'td.pagination div.pagination a', function () {
    runCheck();
  });

  // optional: re-run when table contents mutate
  const container = document.querySelector('.table-container');
  if (container && !container.__observerAttached) {
    const mo = new MutationObserver(() => runCheck());
    mo.observe(container, {childList:true,subtree:true});
    container.__observerAttached = true;
  }
});
