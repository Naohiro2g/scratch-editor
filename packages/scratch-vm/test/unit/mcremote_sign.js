const test = require('tap').test;
const {makeErrorText} = require('../../src/extensions/scratch3_mcremote/block-value');
const {
    formatSignInfoText,
    signIsWaxed,
    signLineColor,
    signLineHasDecoration,
    signLineText
} = require('../../src/extensions/scratch3_mcremote/sign');

const line = (text, color, decorations) => ({text, color, decorations});

const validResult = () => ({
    front: [
        line('Hello', 'red', ['bold']),
        line('', 'black', []),
        line('', 'black', []),
        line('', 'black', [])
    ],
    back: [
        line('Back', '#123abc', ['bold', 'italic']),
        line('', 'black', []),
        line('', 'black', []),
        line('', 'black', [])
    ],
    waxed: false
});

test('formatSignInfoText accepts a valid getSign result and round-trips through the accessors', t => {
    const info = formatSignInfoText(validResult());
    t.equal(signLineText(info, 'front', 0), 'Hello');
    t.equal(signLineColor(info, 'front', 0), 'red');
    t.ok(signLineHasDecoration(info, 'front', 0, 'bold'));
    t.notOk(signLineHasDecoration(info, 'front', 0, 'italic'));
    t.equal(signLineColor(info, 'back', 0), '#123abc');
    t.ok(signLineHasDecoration(info, 'back', 0, 'italic'));
    t.notOk(signIsWaxed(info));
    t.end();
});

test('formatSignInfoText reports a waxed sign', t => {
    const info = formatSignInfoText(Object.assign(validResult(), {waxed: true}));
    t.ok(signIsWaxed(info));
    t.end();
});

test('formatSignInfoText rejects a result missing required top-level fields', t => {
    t.throws(() => formatSignInfoText({front: validResult().front, back: validResult().back}));
    t.throws(() => formatSignInfoText(null));
    t.throws(() => formatSignInfoText('not an object'));
    t.end();
});

test('formatSignInfoText rejects a face that is not exactly four lines', t => {
    const result = validResult();
    result.front = result.front.slice(0, 3);
    t.throws(() => formatSignInfoText(result));
    t.end();
});

test('formatSignInfoText rejects an unknown color token', t => {
    const result = validResult();
    result.front[0] = line('Hi', 'not_a_color', []);
    t.throws(() => formatSignInfoText(result));
    t.end();
});

test('formatSignInfoText accepts a hex color token', t => {
    const result = validResult();
    result.front[0] = line('Hi', '#ABCDEF', []);
    t.doesNotThrow(() => formatSignInfoText(result));
    t.end();
});

test('formatSignInfoText rejects an unknown decoration token', t => {
    const result = validResult();
    result.front[0] = line('Hi', 'black', ['sparkly']);
    t.throws(() => formatSignInfoText(result));
    t.end();
});

test('sign line accessors propagate an existing McRemote ErrorText without reinterpreting it', t => {
    const errorText = makeErrorText('not_a_sign');
    t.equal(signLineText(errorText, 'front', 0), errorText);
    t.equal(signLineColor(errorText, 'front', 0), errorText);
    t.notOk(signLineHasDecoration(errorText, 'front', 0, 'bold'));
    t.notOk(signIsWaxed(errorText));
    t.end();
});

test('sign line accessors return an ErrorText for a malformed SignInfoText input', t => {
    t.ok(signLineText('not json', 'front', 0).startsWith('⟦mcr-error:'));
    t.ok(signLineColor('{}', 'front', 0).startsWith('⟦mcr-error:'));
    t.end();
});

test('sign line accessors return an ErrorText for an invalid face or out-of-range line index', t => {
    const info = formatSignInfoText(validResult());
    t.ok(signLineText(info, 'sideways', 0).startsWith('⟦mcr-error:'));
    t.ok(signLineText(info, 'front', 4).startsWith('⟦mcr-error:'));
    t.ok(signLineText(info, 'front', -1).startsWith('⟦mcr-error:'));
    t.notOk(signLineHasDecoration(info, 'sideways', 0, 'bold'));
    t.end();
});
