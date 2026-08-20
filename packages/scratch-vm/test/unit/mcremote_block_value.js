const test = require('tap').test;
const fixture = require('../../../../mc-remote/protocol/test/fixtures/block-value-v22.json');
const {
    blockInfoHasStateProperty,
    blockInfoId,
    blockInfoState,
    blockInfoStateProperty,
    formatBlockInfoText,
    isErrorText,
    makeErrorText,
    parseStateText,
    remoteErrorText
} = require('../../src/extensions/scratch3_mcremote/block-value');

const blockCatalog = fixture.catalog.block;

test('StateText resolves catalog-native types and canonical property order', t => {
    for (const example of fixture.state_text) {
        t.same(
            parseStateText(example.input, example.block_id, blockCatalog),
            {canonical: example.canonical, state: example.state},
            example.name
        );
    }
    t.end();
});

test('StateText rejects malformed text without falling back to empty state', t => {
    for (const example of fixture.invalid_state_text) {
        t.throws(
            () => parseStateText(example.input, 'minecraft:oak_log', blockCatalog),
            {reason: example.reason},
            example.input
        );
    }
    t.end();
});

test('non-empty StateText requires a matching current catalog', t => {
    t.same(parseStateText('', 'futuremod:block', null), {canonical: '', state: {}});
    t.throws(
        () => parseStateText('mode=demo', 'futuremod:block', null),
        {reason: 'catalog_unavailable_for_state'}
    );
    t.end();
});

test('StateText distinguishes unknown block, property and value', t => {
    t.throws(
        () => parseStateText('axis=z', 'futuremod:block', blockCatalog),
        {reason: 'unknown_block'}
    );
    t.throws(
        () => parseStateText('facing=north', 'oak_log', blockCatalog),
        {reason: 'unknown_property'}
    );
    t.throws(
        () => parseStateText('axis=w', 'oak_log', blockCatalog),
        {reason: 'invalid_property_value'}
    );
    t.end();
});

test('BlockValue formats one canonical BlockInfoText snapshot', t => {
    for (const example of fixture.block_value) {
        t.equal(formatBlockInfoText(example.value), example.text);
    }
    t.end();
});

test('BlockInfoText accessors are pure and preserve ErrorText', t => {
    const value = fixture.block_value[1].text;
    t.equal(blockInfoId(value), 'minecraft:repeater');
    t.equal(blockInfoState(value), 'delay=3,facing=east,locked=false,powered=true');
    t.equal(blockInfoStateProperty(value, 'facing'), 'east');
    t.equal(blockInfoHasStateProperty(value, 'powered'), true);
    t.equal(blockInfoHasStateProperty(value, 'missing'), false);
    t.equal(blockInfoStateProperty(value, 'missing'), makeErrorText('unknown_state_property'));

    const error = makeErrorText('unknown_block');
    t.equal(blockInfoId(error), error);
    t.equal(blockInfoState(error), error);
    t.equal(blockInfoStateProperty(error, 'axis'), error);
    t.end();
});

test('BlockInfoText rejects malformed or non-canonical general strings', t => {
    t.equal(blockInfoId('oak_log[axis=z]'), makeErrorText('invalid_block_info'));
    t.equal(
        blockInfoState('minecraft:repeater[powered=true,delay=3]'),
        makeErrorText('invalid_block_info')
    );
    t.end();
});

test('ErrorText uses exact grammar and allowlists remote reasons', t => {
    t.equal(
        remoteErrorText({reason: fixture.error_text.known_remote.reason}),
        fixture.error_text.known_remote.text
    );
    t.equal(
        remoteErrorText({reason: fixture.error_text.unknown_remote.reason}),
        fixture.error_text.unknown_remote.text
    );
    t.equal(isErrorText(fixture.error_text.known_remote.text), true);
    for (const malformed of fixture.error_text.malformed) {
        t.equal(isErrorText(malformed), false, malformed);
    }
    t.end();
});

test('BlockValue validation rejects unknown fields and unsupported state tokens', t => {
    t.throws(
        () => formatBlockInfoText({block_id: 'minecraft:stone', state: {}, extra: true}),
        {reason: 'invalid_block_info'}
    );
    t.throws(
        () => formatBlockInfoText({block_id: 'minecraft:stone', state: {mode: 'space value'}}),
        {reason: 'unsupported_state_token'}
    );
    t.end();
});
