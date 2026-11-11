const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const test = require('tap').test;
const lock = require('../../../../mc-remote/tooling-lock.json');

const directory = path.resolve(__dirname, '../../../../mc-remote/tooling/fixtures/protocol/test/fixtures');
const suites = {framing: 7, hello: 10, pairing: 10, blocks: 12, errors: 3, close: 6};
const files = Object.keys(suites).map(suite => `client-bootstrap-${suite}-v23.2.1.json`)
    .concat(['client-bootstrap-v1.schema.json', 'block-value-v22.json', 'LICENSE']);

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

test('F1 data has 48 schema-valid cases from the requested source, without replaying client behavior', t => {
    t.equal(lock.fixture_source.commit, '36ebe9e63e4f0afcf949eae998832f68209b8119');
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
    t.equal(total, 48);
    t.end();
});
