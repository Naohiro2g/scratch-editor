const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('tap').test;

test('SVG load wait includes skins whose constructor names are minified', async t => {
    let poll;
    let polling = false;
    const window = {};
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../helper/page-util.js'), 'utf8'), {
        window,
        setInterval (callback) {
            poll = callback;
            polling = true;
            return 1;
        },
        clearInterval () {
            polling = false;
        }
    });

    const image = {complete: false};
    const renderer = {_allSkins: [{}, {constructor: {name: 'B'}, _svgImage: image}]};
    let resolved = false;
    const ready = window.waitForSVGSkinLoad(renderer).then(() => {
        resolved = true;
    });

    poll();
    await Promise.resolve();
    t.equal(resolved, false, 'waits while an SVG image is loading');
    t.equal(polling, true, 'keeps polling until the image loads');

    image.complete = true;
    poll();
    await ready;
    t.equal(resolved, true, 'resolves after the SVG image loads');
    t.equal(polling, false, 'stops polling after completion');
});
