const fs = require('fs');
const path = require('path');
const test = require('tap').test;
const {BrowserHarness, turns} = require('../fixtures/mcremote-bootstrap/browser-harness');

const directory = path.resolve(__dirname, '../../../../mc-remote/tooling/fixtures/protocol/test/fixtures');
const suites = ['framing', 'hello', 'pairing', 'blocks', 'errors', 'close'];
const tcpCases = new Set([
    'F1-FR-01', 'F1-FR-02', 'F1-FR-03', 'F1-FR-04', 'F1-FR-05', 'F1-FR-06', 'F1-CL-03', 'F1-CL-07'
]);

const runV1 = async (t, scenario) => {
    const h = new BrowserHarness(t, scenario);
    const {ext} = h;
    const automatic = (scenario.id.startsWith('F1-AU-') && !['F1-AU-03', 'F1-AU-04'].includes(scenario.id)) ||
        ['F1-HE-01', 'F1-HE-02', 'F1-HE-04', 'F1-HE-05', 'F1-HE-06', 'F1-HE-07',
            'F1-HE-08', 'F1-HE-11', 'F1-HE-12'].includes(scenario.id);
    const firstHello = scenario.steps.find(step => step.message && step.message.method === 'hello');
    if (firstHello && firstHello.message.params.auth) h.token(firstHello.message.params.auth.token);
    const pairing = scenario.id.startsWith('F1-AU-') && !['F1-AU-04', 'F1-AU-05', 'F1-AU-06'].includes(scenario.id);
    const observed = [];
    try {
        for (const step of scenario.steps) {
            switch (step.op) {
            case 'connect':
                if (pairing && h.sockets.length && ext._socket) {
                    h.current = {
                        name: step.connection, socket: ext._socket, ids: new Map(), observed: [], state: 'open'
                    };
                    h.logical.set(step.connection, h.current);
                } else {
                    await h.connect(step.connection, automatic);
                }
                break;
            case 'client_send':
                await h.expectSend(step.message, automatic);
                break;
            case 'peer_send': {
                const actual = h.current.ids.get(step.message.id);
                if (ext._pending.has(actual)) observed.push(step.message.id);
                await h.receive(step.message);
                if (!automatic && step.message.result && step.message.result.protocol) {
                    ext._recordHelloInfo(step.message.result);
                }
                break;
            }
            case 'peer_eof':
                h.current.state = 'closed';
                if (pairing && !h.pending().length) break;
                h.current.socket.close(1011, pairing ? 'one_shot_incomplete_response' : '');
                await turns();
                break;
            case 'client_close':
                if (pairing) break;
                if (scenario.expected.application_failure) {
                    t.equal(h.current.socket.readyState, 3, 'client closed itself after incompatible hello');
                } else {
                    h.current.socket.close(1000);
                }
                h.current.state = 'closed';
                await turns();
                break;
            case 'connect_error':
                h.track('failed-open', ext._open());
                ext._socket.fire('error');
                await turns();
                break;
            case 'approve_pairing':
                break;
            case 'advance_time':
                // AU-02 advances the peer clock; OP-08 separately advances the client TTL.
                break;
            default:
                throw new Error(`Unmapped browser op ${step.op}`);
            }
        }
        await turns();
        const expected = scenario.expected;
        const successful = h.records.filter(record => record.outcome === 'success');
        const failed = h.records.filter(record => record.error);
        if ('result' in expected) t.same(successful.at(-1).result, expected.result, 'decoded result preserved');
        if ('error' in expected) {
            const error = failed.findLast(record => record.error.origin === 'server').error;
            t.same({code: error.code, message: error.message, data: error.data}, expected.error,
                'server error envelope and opaque data preserved');
        }
        if ('reason' in expected) {
            const reasons = failed.map(record => record.error.reason);
            const bootstrap = h.calls.get('bootstrap');
            if (bootstrap && bootstrap.error) reasons.push(bootstrap.error.reason);
            t.ok(reasons.includes(expected.reason), `failure reason ${expected.reason}`);
        }
        if ('compatible' in expected) {
            const response = scenario.steps.findLast(step => step.message && step.message.result &&
                step.message.result.protocol).message.result;
            t.equal(ext._isProtocolCompatible(response.protocol), expected.compatible, 'actual compatibility rule');
        }
        if ('token' in expected) t.equal(ext._readSessionToken(), expected.token, 'saved token');
        if ('discard_token' in expected) t.equal(h.tokenRemoved, expected.discard_token, 'target token disposal');
        if ('pairing_attempts' in expected) t.equal(h.pairingAttempts, expected.pairing_attempts, 'pairBegin count');
        if ('pairing_required' in expected) {
            t.equal(h.pairingAttempts > 0, expected.pairing_required, 'pairing required');
        }
        if ('pending_ids' in expected) t.same(h.pending(), expected.pending_ids, 'pending requests reclaimed');
        for (const [field, outcome] of [['completed_ids', 'success'], ['unanswered_ids', 'completion_unknown']]) {
            if (!(field in expected)) continue;
            const ids = h.current ? [...h.current.ids.keys()] : [];
            t.same(ids.filter(id => h.recordFor(h.current, id).outcome === outcome), expected[field], field);
        }
        if ('local_failures' in expected) {
            for (const failure of expected.local_failures) {
                const record = h.recordFor(h.current, failure.id);
                t.equal(record.outcome, failure.outcome, 'completion unknown');
                t.equal(record.error.origin, 'client', 'client failure');
                t.notOk(Object.prototype.hasOwnProperty.call(record.error, 'code'), 'no server code');
                t.notOk(Object.prototype.hasOwnProperty.call(record.error, 'reason'), 'no transport reason on request');
            }
        }
        if ('connection' in expected) {
            if (expected.connection === 'failed') t.equal(h.calls.get('failed-open').outcome, 'error');
            else t.equal(h.current.socket.readyState === 3 ? 'closed' : 'open', expected.connection);
        }
        if ('matched_ids' in expected) {
            t.same(observed.filter(id => expected.matched_ids.includes(id)),
                expected.matched_ids, 'matched response IDs in reception order');
        }
        if ('ignored_ids' in expected) {
            t.same(scenario.steps.filter(step => step.op === 'peer_send' &&
            !h.current.ids.has(step.message.id)).map(step => step.message.id), expected.ignored_ids);
        }
        if (expected.application_failure) {
            const bootstrap = h.calls.get('bootstrap');
            t.equal(bootstrap.outcome, 'error');
            t.equal(bootstrap.error.reason, 'protocol_mismatch');
            t.not(bootstrap.error.origin, 'server', 'client incompatibility failure');
        }
        if (!['F1-AU-07', 'F1-AU-12'].includes(scenario.id)) {
            t.equal(h.frames.length,
                scenario.steps.filter(step => step.op === 'client_send').length, 'no extra send or automatic replay');
        }
    } finally {
        h.cleanup();
        await turns();
    }
};

for (const suite of suites) {
    const document = JSON.parse(fs.readFileSync(path.join(directory, `client-bootstrap-${suite}-v23.2.1.json`)));
    for (const scenario of document.cases) {
        if (tcpCases.has(scenario.id)) continue;
        test(`F1 browser semantic replay ${scenario.id}: ${scenario.title}`, async t => runV1(t, scenario));
    }
}

const {runOperations} = require('../fixtures/mcremote-bootstrap/operations');
const operations = JSON.parse(fs.readFileSync(path.join(directory, 'client-bootstrap-operations-v23.2.1.json')));
for (const scenario of operations.cases) {
    test(`F1 browser semantic replay ${scenario.id}: ${scenario.title}`, async t => runOperations(t, scenario));
}
