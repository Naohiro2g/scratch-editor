const McRemote = require('../../../src/extensions/scratch3_mcremote');
const Runtime = require('../../../src/engine/runtime');

const copy = value => JSON.parse(JSON.stringify(value));
const turns = async () => {
    for (let index = 0; index < 30; index++) await Promise.resolve();
};

class Clock {
    constructor () {
        this.time = 0;
        this.sequence = 0;
        this.timers = new Map();
    }
    now () {
        return this.time;
    }
    setTimeout (callback, milliseconds) {
        const id = ++this.sequence;
        this.timers.set(id, {at: this.time + milliseconds, callback});
        return id;
    }
    clearTimeout (id) {
        this.timers.delete(id);
    }
    random () {
        return 0.5;
    }
    async advance (milliseconds) {
        this.time += milliseconds;
        // Resume at the new time; do not replay polling during the time jump.
        const due = [...this.timers].filter(([, timer]) => timer.at <= this.time);
        for (const [id, timer] of due) {
            if (!this.timers.delete(id)) continue;
            timer.callback();
            await turns();
        }
        await turns();
    }
    async next () {
        const at = Math.min(...[...this.timers.values()].map(timer => timer.at));
        if (!Number.isFinite(at)) return false;
        await this.advance(Math.max(0, at - this.time));
        return true;
    }
}

class BrowserHarness {
    constructor (t, scenario) {
        this.t = t;
        this.scenario = scenario;
        this.clock = new Clock();
        this.sockets = [];
        this.logical = new Map();
        this.records = [];
        this.calls = new Map();
        this.events = [];
        this.frames = [];
        this.storage = new Map();
        this.tokenRemoved = false;
        this.pairingAttempts = 0;
        const harness = this;
        this.WebSocket = class FakeWebSocket {
            constructor () {
                this.readyState = 0;
                this.protocol = 'mcremote.bridge.one-shot.v1';
                this.bufferedAmount = 0;
                this.listeners = {};
                this.sent = [];
                this.observed = 0;
                harness.sockets.push(this);
            }
            addEventListener (name, callback) {
                (this.listeners[name] = this.listeners[name] || []).push(callback);
            }
            fire (name, data) {
                for (const callback of this.listeners[name] || []) callback(data);
            }
            open () {
                this.readyState = 1;
                this.fire('open');
            }
            send (text) {
                const outer = JSON.parse(text);
                const message = outer.mcremote_bridge_transport ? JSON.parse(outer.payload) : outer;
                if (message.method === 'auth.pairBegin' || message.method === 'auth.pairPoll') {
                    t.equal(outer.mcremote_bridge_transport, 'one-shot-v1', 'auth uses the Bridge one-shot hint');
                }
                this.sent.push(message);
                harness.frames.push({socket: this, message});
                if (message.method === 'auth.pairBegin') harness.pairingAttempts++;
            }
            close (code, reason) {
                if (this.readyState === 3) return;
                this.readyState = 3;
                this.fire('close', {code, reason});
            }
        };
        this.WebSocket.OPEN = 1;
        this.previousWebSocket = global.WebSocket;
        global.WebSocket = this.WebSocket;
        const runtime = {
            startHats: () => {},
            emit: (event, payload) => {
                if (event === Runtime.MCREMOTE_CONNECTION_EVENT) this.events.push(payload);
            }
        };
        this.ext = new McRemote(runtime, {
            requestIdleTimeoutMs: 40000,
            connectTimeoutMs: 40000,
            reconnectInitialDelayMs: 1,
            reconnectMaxDelayMs: 4,
            reconnectTimeoutMs: 0
        });
        this.ext._connectionClock = this.clock;
        this.ext._delay = milliseconds => new Promise(resolve => this.clock.setTimeout(resolve, milliseconds));
        this.ext._clientInfo = () => ({name: 'fixture-client', version: '2321.1.0', locale: 'ja'});
        this.ext._storage = () => ({
            getItem: key => this.storage.get(key) || null,
            setItem: (key, value) => this.storage.set(key, value),
            removeItem: key => {
                if (this.storage.has(key)) this.tokenRemoved = true;
                this.storage.delete(key);
            }
        });
        const startRequest = this.ext._startRequest;
        this.ext._startRequest = (...args) => {
            const id = this.ext._nextRequestId;
            const socket = this.ext._socket;
            const operation = startRequest.apply(this.ext, args);
            const record = {id, socket, method: args[0], outcome: 'pending'};
            this.records.push(record);
            operation.completion.then(result => {
                Object.assign(record, {outcome: 'success', result});
            }, error => {
                Object.assign(record, {outcome: error.completionUnknown ? 'completion_unknown' : 'error', error});
            });
            return operation;
        };
    }
    track (name, promise) {
        const call = {name, outcome: 'pending'};
        this.calls.set(name, call);
        promise.then(result => Object.assign(call, {outcome: 'success', result}),
            error => Object.assign(call, {outcome: 'error', error}));
        return call;
    }
    async pumpUntil (predicate, advance = false) {
        for (let index = 0; index < 15; index++) {
            await turns();
            if (predicate()) return true;
            if (advance && !await this.clock.next()) break;
        }
        return Boolean(predicate());
    }
    token (value) {
        this.ext._saveSessionToken(value);
    }
    async bareConnect () {
        const authenticate = this.ext._authenticate;
        this.ext._authenticate = () => Promise.resolve();
        this.track('bare-open', this.ext._open());
        this.ext._socket.open();
        this.ext._authenticate = authenticate;
        await turns();
        this.ext._connectionStatus = 'connected';
    }
    async connect (name, automatic = false) {
        if (automatic) {
            if (!this.sockets.length || this.ext._socket === null) this.track('bootstrap', this.ext._open());
            const socket = this.ext._socket;
            if (socket && socket.readyState === 0) socket.open();
        } else {
            await this.bareConnect();
        }
        this.current = {name, socket: this.ext._socket, ids: new Map(), observed: [], state: 'open'};
        this.logical.set(name, this.current);
        await turns();
    }
    async expectSend (message, automatic) {
        const logical = this.current;
        if (!automatic) {
            const promise = this.ext._request(message.method, copy(message.params));
            this.track(`${logical.name}:${message.id}`, promise);
        }
        const socket = logical.socket;
        await this.pumpUntil(() => socket.sent.length > socket.observed, true);
        const actual = socket.sent[socket.observed++];
        this.t.ok(actual, `${this.scenario.id}: ${message.method} was generated`);
        if (!actual) throw new Error(`${this.scenario.id}: missing ${message.method}`);
        const normalized = copy(actual);
        if (Object.prototype.hasOwnProperty.call(message, 'id')) {
            logical.ids.set(message.id, actual.id);
            normalized.id = message.id;
        }
        // Restoring the last confirmed context is permitted on reconnect.
        if (message.method === 'hello' && !Object.prototype.hasOwnProperty.call(message.params, 'build')) {
            delete normalized.params.build;
        }
        if (message.method === 'hello' && !Object.prototype.hasOwnProperty.call(message.params, 'client')) {
            delete normalized.params.client;
        }
        this.t.same(normalized, message, `${this.scenario.id}: generated JSON-RPC`);
        logical.observed.push({fixture: message, actual});
    }
    async receive (message) {
        const logical = this.current;
        const actual = copy(message);
        if (logical.ids.has(message.id)) actual.id = logical.ids.get(message.id);
        logical.socket.fire('message', {data: JSON.stringify(actual)});
        await turns();
    }
    pending (logical = this.current) {
        return [...logical.ids].filter(([, actual]) =>
            this.ext._pending.has(actual) && logical.socket === this.ext._socket).map(([fixture]) => fixture);
    }
    recordFor (logical, id) {
        const actual = logical.ids.get(id);
        return this.records.findLast(record => record.socket === logical.socket && record.id === actual);
    }
    cleanup () {
        if (this.ext._connectionPolicy) this.ext._connectionPolicy.autoReconnect = false;
        for (const socket of this.sockets) socket.close(1000);
        this.clock.timers.clear();
        global.WebSocket = this.previousWebSocket;
    }
}

module.exports = {BrowserHarness, turns};
