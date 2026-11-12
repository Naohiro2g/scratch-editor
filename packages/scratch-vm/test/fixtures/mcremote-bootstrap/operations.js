const Runtime = require('../../../src/engine/runtime');
const {BrowserHarness, turns} = require('./browser-harness');

const plainError = error => ({code: error.code, message: error.message, data: error.data});
const has = (value, field) => Object.prototype.hasOwnProperty.call(value, field);

const callSnapshot = (h, call) => {
    const value = {
        call: call.name,
        outcome: call.outcome,
        source: call.kind === 'connect' || call.outcome === 'pending' ? 'client' : 'server'
    };
    if (call.connection) value.connection = call.connection;
    if (call.outcome === 'success' && call.mode === 'FAST') Object.assign(value, {outcome: 'queued', source: 'client'});
    if (!call.error) return value;
    const error = call.error;
    if (error.completionUnknown) {
        h.t.equal(error.name, 'McRemoteCompletionUnknownError', 'typed completion-unknown failure');
        h.t.equal(error.origin, 'client', 'completion unknown is client-side');
        h.t.notOk(has(error, 'code'), 'completion unknown has no server code');
        h.t.notOk(has(error, 'reason'), 'completion unknown has no transport reason');
        return {call: call.name, outcome: 'completion_unknown', source: 'client'};
    }
    if (error.notSent) {
        h.t.equal(error.name, 'McRemoteNotSentError', 'typed not-sent failure');
        h.t.equal(error.origin, 'client', 'not sent is client-side');
        h.t.notOk(has(error, 'code'), 'not sent has no server code');
        h.t.notOk(has(error, 'reason'), 'not sent has no transport reason');
        const cause = typeof error.cause === 'string' ? error.cause : error.cause && error.cause.reason;
        return {
            call: call.name,
            outcome: 'not_sent',
            source: 'client',
            cause: cause === 'protocol_mismatch' ? 'incompatible_protocol' :
                cause === 'auth_required' ? 'pairing_required' : 'connection_failed'
        };
    }
    if (error.origin === 'server') {
        return {...value, outcome: 'server_error', error: plainError(error), source: 'server'};
    }
    if (error.localReason === 'pair_expired') {
        h.t.notOk(has(error, 'code'), 'client expiry has no server code');
        h.t.notOk(has(error, 'reason'), 'client expiry has no server reason');
        return {call: call.name, outcome: 'pairing_expired', source: 'client', equivalent_to: 'pair_expired'};
    }
    return value;
};

const connectionByEpoch = (h, epoch) => [...h.logical.values()].find(connection => connection.epoch === epoch);
const eventSnapshots = h => h.events.flatMap(event => {
    if (event.type !== 'reconnected') return [];
    const current = connectionByEpoch(h, event.epoch);
    const previous = connectionByEpoch(h, event.previousEpoch);
    const base = {connection: current && current.name, previous_connection: previous && previous.name};
    const result = [{kind: 'reconnected', ...base}];
    if (event.eventLoss) result.push({kind: 'events_lost', ...base});
    if (event.serverChanged) result.push({kind: 'server_changed', ...base});
    if (event.sessionChanged) result.push({kind: 'session_changed', ...base});
    return result;
});

const compareFields = (t, actual, expected, title) => {
    t.ok(actual, `${title}: actual observation exists`);
    if (!actual) return;
    for (const [field, value] of Object.entries(expected)) t.same(actual[field], value, `${title}: ${field}`);
};

const compare = (h, expected) => {
    const {t, ext} = h;
    for (const row of expected.calls || []) {
        const call = h.calls.get(row.call);
        compareFields(t, call && callSnapshot(h, call), row, `call ${row.call}`);
    }
    for (const row of expected.connections || []) {
        const connection = h.logical.get(row.connection);
        t.ok(connection, `connection ${row.connection}`);
        if (!connection) continue;
        if (has(row, 'state')) {
            t.equal(connection.state === 'failed' ? 'failed' :
                connection.socket.readyState === 3 || connection.state === 'closed' ? 'closed' : 'open', row.state,
            `${row.connection}: state`);
        }
        t.equal(connection.observed.length, row.sent_count, `${row.connection}: exact sent count`);
        t.same(h.pending(connection).sort(), row.pending_ids.slice().sort(), `${row.connection}: exact pending set`);
        const extra = connection.socket.sent.length - connection.socket.observed;
        t.equal(extra, 0, `${row.connection}: no unobserved extra send`);
    }
    if (has(expected, 'connect_attempts')) t.equal(h.sockets.length, expected.connect_attempts, 'connect attempts');
    const actualEvents = eventSnapshots(h);
    for (const row of expected.events || []) {
        const index = actualEvents.findIndex(actual =>
            Object.entries(row).every(([field, value]) => actual[field] === value));
        t.ok(index !== -1, `required event ${row.kind}`);
        if (index !== -1) actualEvents.splice(index, 1);
    }
    for (const row of expected.negotiations || []) {
        const connection = h.logical.get(row.connection);
        t.equal(connection && connection.compatible, row.compatible, `${row.connection}: compatibility`);
    }
    for (const row of expected.flushes || []) {
        const connection = h.logical.get(row.connection);
        const flush = h.events.find(event => event.type === 'flush' && connection && event.epoch === connection.epoch);
        t.ok(flush, 'actual successful flush observation');
        if (!flush) continue;
        t.equal(flush.previousFlushEpoch !== null && flush.previousFlushEpoch !== flush.epoch,
            row.reconnected_since_previous_flush,
            'flush states whether its connection changed');
        for (const excluded of row.excluded_connections) {
            const old = h.logical.get(excluded);
            t.ok(flush.excludedEpochs.includes(old.epoch), 'old FAST is excluded from the new flush guarantee');
        }
    }
    for (const row of expected.epoch_states || []) {
        const epoch = h.logical.get(row.connection).epoch;
        const event = h.events.find(item => item.type === 'reconnected' && item.epoch === epoch);
        t.ok(event, 'epoch invalidation observed');
        if (!event) continue;
        for (const handle of row.invalidated_handles) {
            t.ok(h.seed.entity_handles.includes(handle), 'handle belongs to the seeded old epoch');
            t.ok(event.invalidated && event.invalidated.includes('entity_handles'),
                'handle epoch invalidated for application');
        }
        for (const cursor of row.invalidated_cursors) {
            t.ok(h.seed.event_cursors.includes(cursor), 'cursor belongs to the old epoch');
            t.not(ext._eventStatus.cursor, cursor, 'old event cursor is no longer active');
        }
    }
    for (const row of expected.catalogs || []) {
        t.ok(h.catalogLookups.includes(row.hello_hash), 'catalog acquisition uses the new hello hash');
        t.equal(h.seed.catalog_hash, row.cached_hash, 'old cache hash');
        t.equal(h.catalogLookups.at(-1) === h.seed.catalog_hash, row.cache_matches,
            'old cache cannot match the new hash');
        t.not(ext.getCatalogState().catalogHash, row.cached_hash, 'old catalog is not current');
    }
};

const runOperations = async (t, scenario) => {
    const h = new BrowserHarness(t, scenario);
    const {ext} = h;
    h.catalogLookups = [];
    // Keep asynchronous cache IO pending while checking which key production acquisition requests.
    ext._catalogCache = {get: hash => {
        h.catalogLookups.push(hash);
        return new Promise(() => {});
    }};
    const initial = scenario.steps.find(step => step.op === 'expect_send' && step.message.method === 'hello').message;
    if (initial.params.auth) h.token(initial.params.auth.token);
    try {
        for (const step of scenario.steps) {
            if (step.connection && h.logical.has(step.connection)) h.current = h.logical.get(step.connection);
            switch (step.op) {
            case 'app_connect': {
                const call = h.track(step.call, ext._open(null, {build: initial.params.build}));
                call.kind = 'connect';
                break;
            }
            case 'expect_connect': {
                const virtual = scenario.id === 'F1-OP-08' && step.connection === 'c2';
                await h.pumpUntil(() => virtual || h.sockets.some(socket => !socket.assigned), true);
                const socket = virtual ? h.sockets[0] : h.sockets.find(item => !item.assigned);
                t.ok(socket, 'client initiated the required connection');
                if (!socket) throw new Error(`${scenario.id}: expected ${step.connection}`);
                socket.assigned = true;
                h.current = {name: step.connection, socket, ids: new Map(), observed: [], state: 'open'};
                h.logical.set(step.connection, h.current);
                await turns();
                break;
            }
            case 'expect_send':
                if (h.current.socket.readyState === 0) h.current.socket.open();
                await h.expectSend(step.message, true);
                break;
            case 'peer_send': {
                const message = step.message;
                const id = h.current.ids.get(message.id);
                const record = h.records.findLast(item => item.socket === h.current.socket && item.id === id);
                if (record) record.connection = h.current.name;
                await h.receive(message);
                if (message.result && message.result.expires_in) h.pairingTtlMs = message.result.expires_in * 1000;
                if (message.result && message.result.protocol) {
                    h.current.compatible = ext._isProtocolCompatible(message.result.protocol);
                    if (h.current.compatible) h.current.epoch = ext._connectionEpoch;
                }
                for (const call of h.calls.values()) {
                    if (call.record === record) call.connection = h.current.name;
                }
                break;
            }
            case 'app_call': {
                const before = h.records.length;
                let promise;
                if (step.mode === 'FAST') {
                    promise = ext._enqueueOutbound(() => ext._startNotification(step.method, step.params));
                } else {
                    promise = ext._request(step.method, step.params);
                }
                const call = h.track(step.call, promise);
                call.mode = step.mode;
                call.method = step.method;
                call.record = h.records[before];
                // A call waiting for reconnect obtains its request record only after hello.
                call.recordStart = before;
                break;
            }
            case 'peer_eof':
                h.current.state = 'closed';
                if (scenario.id !== 'F1-OP-08') h.current.socket.close(1011, '');
                await turns();
                break;
            case 'socket_error':
                h.current.socket.fire('error');
                await turns();
                break;
            case 'connect_error':
                h.current.state = 'failed';
                h.current.socket.fire('error');
                await turns();
                break;
            case 'liveness_lost':
                // Browser transport reports loss through close; its ping probe is Bridge-owned.
                h.current.socket.close(1006, '');
                await turns();
                break;
            case 'advance_clock': {
                const duration = step.timer === 'pairing_ttl' ?
                    h.pairingTtlMs : ext._connectionPolicy.requestIdleTimeoutMs;
                await h.clock.advance(duration * step.fraction.numerator / step.fraction.denominator);
                break;
            }
            case 'seed_epoch_state':
                h.seed = step;
                ext._eventStatus.cursor = step.event_cursors[0];
                break;
            case 'observe':
                await turns();
                for (const call of h.calls.values()) {
                    const record = h.records.slice(call.recordStart).find(item => item.method === call.method);
                    if (record && record.connection) call.connection = record.connection;
                }
                compare(h, step.expected);
                break;
            default:
                throw new Error(`Unmapped operation ${step.op}`);
            }
        }
        await turns();
        for (const call of h.calls.values()) {
            const record = h.records.slice(call.recordStart).find(item => item.method === call.method);
            if (record && record.connection) call.connection = record.connection;
        }
        compare(h, scenario.expected);
        t.ok(Runtime.MCREMOTE_CONNECTION_EVENT, 'runtime names the read-only connection event');
    } finally {
        h.cleanup();
        await turns();
    }
};

module.exports = {runOperations};
