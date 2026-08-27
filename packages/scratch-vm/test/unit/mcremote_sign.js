const test = require('tap').test;
const {makeErrorText} = require('../../src/extensions/scratch3_mcremote/block-value');
const {
    DECORATIONS,
    FACES,
    formatSignInfoText,
    signIsWaxed,
    signLineColor,
    signLineHasDecoration,
    signLineText
} = require('../../src/extensions/scratch3_mcremote/sign');
const signFixture = require('../../../../mc-remote/protocol/test/fixtures/sign-v23.json');

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

test('FACES and DECORATIONS match the shared protocol fixture (mc-remote/protocol/test/fixtures/sign-v23.json)', t => {
    t.same(FACES, Object.keys(signFixture.get_sign['B6-S03'].result).filter(key => key !== 'waxed'));
    t.same(DECORATIONS, signFixture.decorations.canonical_order);
    t.same(DECORATIONS.slice().sort(), DECORATIONS, 'sign.js decoration order is already alphabetical');
    t.end();
});

test('formatSignInfoText accepts the shared B6-S03 world.getSign fixture result and round-trips', t => {
    const {result} = signFixture.get_sign['B6-S03'];
    const info = formatSignInfoText(result);
    t.equal(signLineText(info, 'front', 1), result.front[1].text);
    t.equal(signLineColor(info, 'front', 1), result.front[1].color);
    t.ok(signLineHasDecoration(info, 'front', 1, 'bold'));
    t.equal(signLineColor(info, 'back', 0), result.back[0].color);
    t.ok(signLineHasDecoration(info, 'back', 0, 'italic'));
    t.ok(signIsWaxed(info), 'B6-S03 fixture sign is waxed and must still be readable');
    t.end();
});

test('formatSignInfoText normalizes the shared B6-S02 unsorted-decorations fixture case to canonical name order', t => {
    const {result} = signFixture.line_values['B6-S02'].from_object_unsorted_input;
    const info = formatSignInfoText({
        front: [result, result, result, result],
        back: [result, result, result, result],
        waxed: false
    });
    for (const decoration of result.decorations) {
        t.ok(signLineHasDecoration(info, 'front', 0, decoration));
    }
    t.end();
});
