const HANDOFF_PROTOCOL_VERSION = 1;
const HANDOFF_READY = 'mcremote.wirescope.ready';
const HANDOFF_ATTACH = 'mcremote.wirescope.attach';
const HANDOFF_GRANT = 'mcremote.wirescope.grant';
const HANDOFF_REDEEM = 'mcremote.wirescope.redeem';
const OBSERVER_SNAPSHOT = 'mcremote.wirescope.snapshot';
const OBSERVER_END = 'mcremote.wirescope.end';
const GRANT_LIFETIME_MS = 15000;

const OBSERVED_METHODS = new Set([
    'hello',
    'build.setWorld',
    'build.setOrigin',
    'chat.post',
    'world.setBlock',
    'world.setBlocks',
    'world.getBlock',
    'player.getPos',
    'player.setPos'
]);

const isObject = function (value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};
const finiteNumber = function (value) {
    return typeof value === 'number' && Number.isFinite(value);
};
const optionalString = function (value) {
    return typeof value === 'string' && value ? value : null;
};
const optionalBoolean = function (value) {
    return typeof value === 'boolean' ? value : void 0;
};
const scalar = function (value) {
    return value === null || typeof value === 'string' || typeof value === 'boolean' ||
        finiteNumber(value) ? value : void 0;
};

const numberTuple = function (value) {
    return Array.isArray(value) && value.length === 3 && value.every(finiteNumber) ?
        value.slice() :
        null;
};

const allowHello = function (value) {
    if (!isObject(value)) return null;
    const worldConstants = isObject(value.world_constants) ? value.world_constants : {};
    const ySea = value.y_sea === null || finiteNumber(value.y_sea) ? value.y_sea :
        worldConstants.y_sea === null || finiteNumber(worldConstants.y_sea) ? worldConstants.y_sea : null;
    const result = {
        protocol: optionalString(value.protocol) || '',
        mc_version: optionalString(value.mc_version) || '',
        supported_mc_versions: Array.isArray(value.supported_mc_versions) ?
            value.supported_mc_versions.filter((...[item]) => typeof item === 'string') :
            [],
        catalog_hash: typeof value.catalogHash === 'string' ? value.catalogHash.toLowerCase() : null,
        world_constants: {y_sea: ySea}
    };
    const world = optionalString(value.world);
    const origin = numberTuple(value.origin);
    if (world) result.world = world;
    if (origin) result.origin = origin;
    if (isObject(value.permissions)) {
        const permissions = {};
        const online = optionalBoolean(value.permissions.online);
        const offline = optionalBoolean(value.permissions.offline);
        const buildRange = value.permissions.buildRange;
        if (typeof online !== 'undefined') permissions.online = online;
        if (typeof offline !== 'undefined') permissions.offline = offline;
        if (typeof buildRange === 'string' || finiteNumber(buildRange)) permissions.build_range = buildRange;
        if (Object.keys(permissions).length) result.permissions = permissions;
    }
    return result;
};

const allowClient = function (value) {
    if (!isObject(value)) return null;
    const name = optionalString(value.name);
    const version = optionalString(value.version);
    if (!name || !version) return null;
    const result = {name, version};
    if (typeof value.locale === 'string') result.locale = value.locale;
    return result;
};

const allowHelloParams = function (value) {
    if (!isObject(value)) return null;
    const protocol = optionalString(value.protocol);
    if (!protocol) return null;
    const result = {protocol};
    const client = allowClient(value.client);
    if (client) result.client = client;
    if (isObject(value.build)) {
        const build = {};
        const world = optionalString(value.build.world);
        const origin = numberTuple(value.build.origin);
        if (world) build.world = world;
        if (origin) build.origin = origin;
        if (Object.keys(build).length) result.build = build;
    }
    return result;
};

const allowArrayParams = function (value) {
    if (!Array.isArray(value)) return null;
    const result = value.map(scalar);
    return result.some((...[item]) => typeof item === 'undefined') ? null : result;
};

const allowPosition = function (value) {
    if (!isObject(value)) return null;
    const world = optionalString(value.world);
    const pos = numberTuple(value.pos);
    return world && pos ? {world, pos} : null;
};

const allowError = function (value) {
    if (!isObject(value)) return null;
    const code = typeof value.code === 'string' || finiteNumber(value.code) ? value.code : null;
    const message = optionalString(value.message) || 'McRemote error';
    const error = {code, message};
    if (isObject(value.data)) {
        const data = {};
        if (typeof value.data.reason === 'string') data.reason = value.data.reason;
        if (typeof value.data.ref === 'string') data.ref = value.data.ref;
        if (Array.isArray(value.data.allowed)) {
            const allowed = value.data.allowed.map(scalar)
                .filter((...[item]) => typeof item !== 'undefined');
            if (allowed.length === value.data.allowed.length) data.allowed = allowed;
        }
        if (Object.keys(data).length) error.data = data;
    }
    return error;
};

const allowFramePayload = function (frame) {
    const payload = isObject(frame.payload) ? frame.payload : {};
    if (frame.direction === 'send') {
        const params = frame.method === 'hello' ? allowHelloParams(payload.params) : allowArrayParams(payload.params);
        return params === null ? null : {params};
    }
    if (isObject(payload.error)) return {error: allowError(payload.error)};
    if (!Object.prototype.hasOwnProperty.call(payload, 'result')) return null;
    if (frame.method === 'hello') {
        const result = allowHello(payload.result);
        return result ? {result} : null;
    }
    if (frame.method === 'player.getPos' || frame.method === 'player.setPos') {
        const result = allowPosition(payload.result);
        return result ? {result} : null;
    }
    if (frame.method === 'world.getBlock') {
        return typeof payload.result === 'string' ? {result: payload.result} : null;
    }
    const result = scalar(payload.result);
    return typeof result === 'undefined' ? null : {result};
};

const allowFrame = function (frame) {
    if (!isObject(frame) || !OBSERVED_METHODS.has(frame.method) || String(frame.method).indexOf('auth.') === 0) {
        return null;
    }
    if (frame.direction !== 'send' && frame.direction !== 'receive') return null;
    const payload = allowFramePayload(frame);
    if (!payload || !finiteNumber(frame.sequence) || !finiteNumber(frame.timestamp)) return null;
    const requestId = typeof frame.id === 'string' || finiteNumber(frame.id) ? frame.id : null;
    return {
        sequence: frame.sequence,
        observed_at: frame.timestamp,
        direction: frame.direction,
        request_id: requestId,
        method: frame.method,
        payload
    };
};

const toWireScopeSnapshot = (observation, targetId, emittedAt = Date.now()) => {
    if (!isObject(observation) || observation.status !== 'connected' || !observation.displayAlias) return null;
    const hello = allowHello(observation.hello);
    if (!hello || !targetId) return null;
    const frames = Array.isArray(observation.frameLog) ? observation.frameLog.map(allowFrame).filter(Boolean) : [];
    return {
        schema: 'mcremote.observer',
        schema_version: 1,
        emitted_at: emittedAt,
        target: {
            id: targetId,
            display_alias: observation.displayAlias,
            source_kind: 'scratch'
        },
        streams: [{
            id: observation.streamId === 'default' || !observation.streamId ? 'main' : observation.streamId,
            kind: 'main',
            status: observation.lastError ? 'error' : 'connected',
            hello,
            frames
        }]
    };
};

const randomToken = function (cryptoObject) {
    if (!cryptoObject || typeof cryptoObject.getRandomValues !== 'function') {
        throw new Error('createWireScopeSource: secure randomness is unavailable');
    }
    const bytes = cryptoObject.getRandomValues(new Uint8Array(24));
    return Array.from(bytes, (...[byte]) => byte.toString(16).padStart(2, '0')).join('');
};

const createWireScopeSource = function (environment) {
    const pending = new Map();
    const sessions = new Set();
    let currentObservation = null;
    let target = null;
    let listening = false;

    const postSession = (port, message) => port.postMessage(Object.assign({
        protocol_version: HANDOFF_PROTOCOL_VERSION
    }, message));

    const closeTarget = function (reason) {
        for (const pendingLaunch of pending.values()) {
            if (pendingLaunch.port) pendingLaunch.port.close();
            environment.clearTimeout.call(environment.window, pendingLaunch.timeoutId);
        }
        pending.clear();
        for (const session of sessions) {
            postSession(session.port, {type: OBSERVER_END, reason});
            session.port.close();
        }
        sessions.clear();
        target = null;
    };

    const publish = () => {
        if (!target) return;
        const snapshot = toWireScopeSnapshot(currentObservation, target.id, environment.now());
        if (!snapshot) return;
        target.snapshot = snapshot;
        for (const session of sessions) {
            postSession(session.port, {type: OBSERVER_SNAPSHOT, snapshot});
        }
    };

    const onReady = function (event) {
        if (!event || !isObject(event.data) || event.data.type !== HANDOFF_READY ||
            event.data.protocol_version !== HANDOFF_PROTOCOL_VERSION) return;
        const pendingLaunch = pending.get(event.source);
        if (!pendingLaunch || event.origin !== pendingLaunch.origin || !target ||
            target.id !== pendingLaunch.targetId || pendingLaunch.port) return;
        const channel = new environment.MessageChannel();
        const grant = randomToken(environment.crypto);
        const expiresAt = environment.now() + GRANT_LIFETIME_MS;
        pendingLaunch.port = channel.port1;
        channel.port1.addEventListener('message', (...[portEvent]) => {
            if (!isObject(portEvent.data) || portEvent.data.type !== HANDOFF_REDEEM ||
                portEvent.data.protocol_version !== HANDOFF_PROTOCOL_VERSION ||
                portEvent.data.grant !== grant || pendingLaunch.redeemed ||
                environment.now() > expiresAt || !target || target.id !== pendingLaunch.targetId) return;
            pendingLaunch.redeemed = true;
            environment.clearTimeout.call(environment.window, pendingLaunch.timeoutId);
            pending.delete(event.source);
            const session = {port: channel.port1, targetId: target.id};
            sessions.add(session);
            postSession(session.port, {type: OBSERVER_SNAPSHOT, snapshot: target.snapshot});
        });
        channel.port1.start();
        event.source.postMessage({
            type: HANDOFF_ATTACH,
            protocol_version: HANDOFF_PROTOCOL_VERSION
        }, pendingLaunch.origin, [channel.port2]);
        postSession(channel.port1, {
            type: HANDOFF_GRANT,
            grant,
            expires_at: expiresAt
        });
        pendingLaunch.timeoutId = environment.setTimeout.call(environment.window, () => {
            if (pendingLaunch.redeemed) return;
            pending.delete(event.source);
            channel.port1.close();
        }, GRANT_LIFETIME_MS);
    };

    const ensureListener = () => {
        if (listening) return;
        environment.window.addEventListener('message', onReady);
        listening = true;
    };

    return {
        update (observation) {
            currentObservation = observation;
            const connected = isObject(observation) && observation.status === 'connected' &&
                Boolean(observation.displayAlias) && Boolean(observation.hello);
            if (!connected) {
                if (target) closeTarget('target-ended');
                return;
            }
            if (!target || target.displayAlias !== observation.displayAlias) {
                if (target) closeTarget('target-ended');
                target = {
                    id: `target-${randomToken(environment.crypto)}`,
                    displayAlias: observation.displayAlias,
                    snapshot: null
                };
            }
            publish();
        },
        launch (wireScopeUrl) {
            if (!target || !wireScopeUrl) return false;
            const url = new URL(wireScopeUrl);
            const observerWindow = environment.window.open(url.toString(), '_blank');
            if (!observerWindow) return false;
            ensureListener();
            pending.set(observerWindow, {
                origin: url.origin,
                targetId: target.id,
                port: null,
                redeemed: false,
                timeoutId: null
            });
            return true;
        },
        destroy () {
            closeTarget('source-closed');
            if (listening) environment.window.removeEventListener('message', onReady);
            listening = false;
        }
    };
};

const defaultEnvironment = () => ({
    window,
    MessageChannel,
    crypto,
    now: Date.now,
    setTimeout,
    clearTimeout
});

let defaultSource;
const source = () => {
    if (!defaultSource) defaultSource = createWireScopeSource(defaultEnvironment());
    return defaultSource;
};

const updateWireScopeObservation = function (observation) {
    return source().update(observation);
};
const launchWireScope = function (wireScopeUrl) {
    return source().launch(wireScopeUrl);
};

export {
    createWireScopeSource,
    launchWireScope,
    toWireScopeSnapshot,
    updateWireScopeObservation
};
