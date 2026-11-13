const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const test = require('tap').test;
const lock = require('../../../../mc-remote/tooling-lock.json');

const directory = path.resolve(__dirname, '../../../../mc-remote/tooling/fixtures/protocol/test/fixtures');
const suites = {framing: 7, hello: 12, pairing: 12, blocks: 12, errors: 3, close: 8};
const files = Object.keys(suites).map(suite => `client-bootstrap-${suite}-v23.2.1.json`)
    .concat([
        'client-bootstrap-v1.schema.json', 'client-bootstrap-operations-v23.2.1.json',
        'client-bootstrap-v2.schema.json', 'block-value-v22.json', 'LICENSE'
    ]);

for (const file of files) {
    test(`F1 acquisition identity: ${file}`, t => {
        const record = lock.fixtures.find(entry => entry.path === `packages/protocol/test/fixtures/${file}`);
        t.ok(record, 'the consumer lock includes this source');
        const bytes = fs.readFileSync(path.join(directory, file));
        t.equal(bytes.length, record.bytes);
        t.equal(crypto.createHash('sha256').update(bytes)
            .digest('hex'), record.sha256);
        t.end();
    });
}

test('F1 data has 54 schema-valid cases from the requested source, without replaying client behavior', t => {
    t.equal(lock.fixture_source.commit, '335c604f859d6dfad04f0434bfa4eb6445761430');
    const schema = JSON.parse(fs.readFileSync(path.join(directory, 'client-bootstrap-v1.schema.json'), 'utf8'));
    const validate = new Ajv({allErrors: true, strict: false}).compile(schema);
    let total = 0;
    for (const [suite, count] of Object.entries(suites)) {
        const file = path.join(directory, `client-bootstrap-${suite}-v23.2.1.json`);
        const document = JSON.parse(fs.readFileSync(file, 'utf8'));
        t.equal(validate(document), true, `${suite}: schema`);
        t.equal(document.cases.length, count, `${suite}: case count`);
        total += document.cases.length;
    }
    t.equal(total, 54);
    t.end();
});

test('F1 v2 operations has 12 schema-valid cases', t => {
    const schema = JSON.parse(fs.readFileSync(path.join(directory, 'client-bootstrap-v2.schema.json'), 'utf8'));
    const file = path.join(directory, 'client-bootstrap-operations-v23.2.1.json');
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    const validate = new Ajv({allErrors: true, strict: false}).compile(schema);
    t.equal(validate(document), true, JSON.stringify(validate.errors));
    t.equal(document.cases.length, 12);
    t.end();
});
