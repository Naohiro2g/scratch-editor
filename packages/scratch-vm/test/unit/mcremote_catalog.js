const crypto = require('crypto');
const test = require('tap').test;

const {
    canonicalStringify,
    pickerBlockId,
    validateCatalogResult
} = require('../../src/extensions/scratch3_mcremote/catalog');

const catalogBody = {
    block: {
        'examplemod:ruby_block': {
            states: {},
            default_state: {}
        },
        'minecraft:oak_log': {
            states: {axis: ['x', 'y', 'z']},
            default_state: {axis: 'y'}
        }
    },
    entity: {
        'minecraft:allay': {}
    },
    particle: {
        'minecraft:ash': {}
    }
};

const sha256 = value => Promise.resolve(
    crypto.createHash('sha256').update(value, 'utf8')
        .digest('hex')
);

test('canonicalStringify recursively sorts object keys and preserves array order', t => {
    t.equal(
        canonicalStringify({z: 1, a: {d: 2, b: [3, {y: true, x: false}]}}),
        '{"a":{"b":[3,{"x":false,"y":true}],"d":2},"z":1}'
    );
    t.end();
});

test('validateCatalogResult accepts the wire schema and recomputed hash', async t => {
    const catalogHash = await sha256(canonicalStringify(catalogBody));
    const result = Object.assign({catalogHash}, catalogBody);

    const validated = await validateCatalogResult(result, catalogHash, sha256);

    t.equal(validated.catalogHash, catalogHash);
    t.same(validated.block['minecraft:oak_log'].default_state, {axis: 'y'});
});

test('validateCatalogResult rejects a digest which does not match hello', async t => {
    const catalogHash = await sha256(canonicalStringify(catalogBody));
    const result = Object.assign({catalogHash}, catalogBody);

    await t.rejects(
        validateCatalogResult(result, '0'.repeat(64), sha256),
        {reason: 'catalog_hash_mismatch'}
    );
});

test('validateCatalogResult enforces state schema without rejecting extension fields', async t => {
    const invalidBody = JSON.parse(JSON.stringify(catalogBody));
    invalidBody.block['minecraft:oak_log'] = {
        states: {axis: ['x', 'y', 'y']},
        default_state: {axis: 'y'},
        future_extension: {ignored: true}
    };
    const catalogHash = await sha256(canonicalStringify(invalidBody));

    await t.rejects(
        validateCatalogResult(Object.assign({catalogHash}, invalidBody), catalogHash, sha256),
        {reason: 'invalid_catalog'}
    );

    const validBody = JSON.parse(JSON.stringify(catalogBody));
    validBody.block['minecraft:oak_log'].future_extension = {ignored: true};
    const validHash = await sha256(canonicalStringify(validBody));
    await t.resolves(validateCatalogResult(Object.assign({catalogHash: validHash}, validBody), validHash, sha256));
});

test('validateCatalogResult distinguishes boolean and number state values', async t => {
    const invalidBody = JSON.parse(JSON.stringify(catalogBody));
    invalidBody.block['minecraft:oak_log'] = {
        states: {powered: [false, 0]},
        default_state: {powered: false}
    };
    const catalogHash = await sha256(canonicalStringify(invalidBody));

    await t.rejects(
        validateCatalogResult(Object.assign({catalogHash}, invalidBody), catalogHash, sha256),
        {reason: 'invalid_catalog'}
    );
});

test('pickerBlockId shortens only the special minecraft namespace', t => {
    t.equal(pickerBlockId('minecraft:oak_log'), 'oak_log');
    t.equal(pickerBlockId('examplemod:ruby_block'), 'examplemod:ruby_block');
    t.end();
});
