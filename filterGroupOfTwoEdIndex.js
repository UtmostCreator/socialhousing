const worstLocations = ['Lochend', 'Inch', 'West Pilton', 'Granton', 'Muirhouse', 'Clermiston/Parkgrove', 'Greendykes', 'Royston Mains', 'Southhouse/Burdiehous', 'Restalrig', 'Milton', 'Dumbryden', 'Calders', 'Hyvots', 'Hailesland', 'Murrayburn', 'Saughton Mains',
    'Prestonfield', 'Craigmillar', 'Niddrie', 'Moredun', 'Gilmerton', 'Gracemount',
    'Bingham, Magdalene and The Christians', 'Stenhouse', 'Saughton', 'Broomhouse', 'Wester Hails', 'Wester Hailes', 'Inch', 'Westburn'
];
const quiteBadLocations = ['Leith'];

const valueClass = '.field-value-min';
const propertyItemClass = '.table-row-min';
const moreChancesArr = ['Mover'];
const roomTypeFilterArr = ["Two"];
const propertyFilteredTypesArr = ["Mover", "Either Starter or Mover"];
const notTheBestLevelArr = ['Basement', 'Ground'];
const notSuitableArr = ['Starter'];
const removeWhenArr = ['Aged 60 and over', 'Sheltered', 'Aged 50 and over', 'Preferably aged 60 and over','Preferably aged 50 and over', 'Dispersed alarm'];
// const removeWhenArr = ['Aged 60 and over', 'Sheltered', 'Aged 50 and over', 'Preferably aged 60 and over','Preferably aged 50 and over', 'Dispersed alarm'];
const warningArr = ['Fourth', 'Multi storey flat'];
$(document).ready(function () {

    function doubleCheckChanges() {
        let tableContainer = $('.table-container');
        if (!tableContainer.length) {
            return;
        }
        if (!tableContainer.hasClass('your-class-name')) {
            tableContainer.addClass('your-class-name');
            console.log('Class added to .table-container');
            runCheck();
        }
        setTimeout(doubleCheckChanges, 100);
    }
    function runCheck() {
        if ($('#body-primary-region .table-row-min')) {
            $('html, body').animate({
                scrollTop: 0
            }, 'slow');
        }
        let removeOnThisPage = $('.page-header').length && ['Basket', 'Bid Registration'].includes($('.page-header').text());
        $(propertyItemClass).each(function () {
            const that = $(this);
            let roomTypeOk = false;
            let propTypeOk = false;
            let worstPlace = false;
            let quiteBadPlace = false;
            let notSuitable = false;
            let removeThis = false;
            let moreChances = false;
            let notTheBestLevel = false;
            let warning = false;
            $(this).find(valueClass).each(function () {
                let text = $(this).text().trim();
                if (roomTypeFilterArr.includes(text)) {
                    roomTypeOk = true;
                }
                if (removeWhenArr.includes(text)) {
                    $(this).text('👴' + $(this).text());
                }
                if (text === 'House') {
                    $(this).text($(this).text() + '🏡');
                    $(this).css('font-size', '18px');
                }
                if (worstLocations.includes(text)) {
                    worstPlace = true;
                }
                if (quiteBadLocations.includes(text)) {
                    quiteBadPlace = true;
                }
                if (propertyFilteredTypesArr.includes(text)) {
                    propTypeOk = true;
                }
                if (notSuitableArr.includes(text)) {
                    notSuitable = true;
                }
                if (moreChancesArr.includes(text) && propTypeOk && roomTypeOk) {
                    moreChances = true;
                }
                if (warningArr.includes(text)) {
                    warning = true;
                    $(this).css('color', 'orange');
                }
                if (notTheBestLevelArr.includes(text)) {
                    notTheBestLevel = true;
                    $(this).css('color', 'red');
                }
            });
            if ((!roomTypeOk || removeThis) && !removeOnThisPage) {
                $(this).remove();
            }
            if (notTheBestLevel || warning) {
                $(this).css({
                    "border-color": "yellow",
                    "border-width": "4px",
                    "border-style": "solid"
                });
            }
            if (moreChances && !worstPlace && !quiteBadPlace) {
                $(this).css('background-color', 'green');
                $(this).css({
                    "border-color": "blue",
                    "border-width": "4px",
                    "border-style": "solid"
                });
                $(this).parent().prepend($(this));
            } else if (roomTypeOk && propTypeOk) {
                if (worstPlace) {
                    $(this).css('background-color', 'indianred');
                    $(this).css('opacity', '.5');
                    $(this).parent().append($(this))
                } else if (quiteBadPlace) {
                    $(this).css('background-color', 'orange');
                }  else if (warning) {
                    $(this).css('background-color', 'burlywood');
                } else {
                    $(this).css('background-color', 'yellowgreen');
                }
            } else if (notSuitable) {
                $(this).css('background-color', 'yellow');
                $(this).css('opacity', '.5');
            }
        });
        $('html, body').animate({
            scrollTop: 0
        }, 'fast');
    }
    doubleCheckChanges();
    $('#body-primary-region').on('click', 'td.pagination div.pagination a', function () {
        $('.table-container').innerHTML = '';
        runCheck();
    });
});
