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
    'build.setDimension',
    'build.setOrigin',
    'chat.post',
    'world.setBlock',
    'world.setBlocks',
    'world.getBlock',
    'world.getBlocks',
    'world.getHeight',
    'world.spawnParticle',
    'world.spawnEntity',
    'connection.flush',
    'events.poll',
    'player.getPos',
    'player.setPos',
    'player.getPose',
    'player.setPose'
]);

const isObject = function (value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};
const hasExactFields = function (value, fields) {
    return isObject(value) && Object.keys(value).every(field => fields.indexOf(field) !== -1);
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
    const dimension = optionalString(value.dimension);
    const origin = numberTuple(value.origin);
    if (!dimension || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(dimension) || !origin) return null;
    result.dimension = dimension;
    result.origin = origin;
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
        const dimension = optionalString(value.build.dimension);
        const origin = numberTuple(value.build.origin);
        if (Object.prototype.hasOwnProperty.call(value.build, 'dimension')) {
            if (!dimension || !/^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(dimension)) return null;
            build.dimension = dimension;
        }
        if (Object.prototype.hasOwnProperty.call(value.build, 'origin')) {
            if (!origin) return null;
            build.origin = origin;
        }
        if (Object.keys(build).length) result.build = build;
    }
    return result;
};

const allowArrayParams = function (value) {
    if (!Array.isArray(value)) return null;
    const result = value.map(scalar);
    return result.some((...[item]) => typeof item === 'undefined') ? null : result;
};

const allowBlock = function (value, canonicalId) {
    if (!isObject(value) || !optionalString(value.block_id) || !isObject(value.state)) return null;
    const blockIdPattern = canonicalId ?
        /^[a-z0-9_.-]+:[a-z0-9_./-]+$/ :
        /^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/;
    if (!blockIdPattern.test(value.block_id)) return null;
    const state = {};
    for (const property of Object.keys(value.state)) {
        const stateValue = scalar(value.state[property]);
        if (!/^[a-z0-9_]+$/.test(property) || stateValue === null || typeof stateValue === 'undefined') return null;
        state[property] = stateValue;
    }
    return {block_id: value.block_id, state};
};

const allowExactNumberParams = function (value, length) {
    return Array.isArray(value) && value.length === length && value.every(Number.isInteger) ? value.slice() : null;
};

const allowEventsPollParams = function (value) {
    if (!Array.isArray(value) || (value.length !== 1 && value.length !== 2) ||
        !Number.isInteger(value[0]) || value[0] < 0) return null;
    if (value.length === 1) return [value[0]];
    const options = value[1];
    if (!hasExactFields(options, ['max_events']) || Object.keys(options).length !== 1 ||
        !Number.isInteger(options.max_events) || options.max_events <= 0) return null;
    return [value[0], {max_events: options.max_events}];
};

const canonicalResourceId = function (value) {
    return typeof value === 'string' && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value);
};
const dimensionRef = function (value) {
    return typeof value === 'string' && /^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(value);
};
const faceToken = function (value) {
    return typeof value === 'string' && /^[a-z_]+$/.test(value);
};

const allowParams = function (method, value) {
    if (method === 'hello') return allowHelloParams(value);
    if (method === 'build.setDimension') {
        return Array.isArray(value) && value.length === 1 && dimensionRef(value[0]) ? value.slice() : null;
    }
    if (method === 'world.setBlock') {
        const coordinates = allowExactNumberParams(Array.isArray(value) ? value.slice(0, 3) : null, 3);
        const block = Array.isArray(value) && value.length === 4 ? allowBlock(value[3], false) : null;
        return coordinates && block ? coordinates.concat([block]) : null;
    }
    if (method === 'world.setBlocks') {
        const coordinates = allowExactNumberParams(Array.isArray(value) ? value.slice(0, 6) : null, 6);
        const block = Array.isArray(value) && value.length === 7 ? allowBlock(value[6], false) : null;
        return coordinates && block ? coordinates.concat([block]) : null;
    }
    if (method === 'world.getBlock') return allowExactNumberParams(value, 3);
    if (method === 'world.getBlocks') return allowExactNumberParams(value, 6);
    if (method === 'world.getHeight') {
        return Array.isArray(value) && (value.length === 2 || value.length === 3) && value.every(Number.isInteger) ?
            value.slice() : null;
    }
    if (method === 'world.spawnEntity') {
        if (!Array.isArray(value) || value.length !== 4 || !value.slice(0, 3).every(finiteNumber) ||
            !canonicalResourceId(value[3])) return null;
        return value.slice();
    }
    if (method === 'world.spawnParticle') {
        if (!Array.isArray(value) || (value.length !== 9 && value.length !== 10) ||
            !value.slice(0, 3).every(finiteNumber) ||
            !value.slice(3, 6).every(item => finiteNumber(item) && item >= 0) ||
            !canonicalResourceId(value[6]) || !finiteNumber(value[7]) || value[7] < 0 ||
            !Number.isInteger(value[8]) || value[8] < 0 ||
            (value.length === 10 && typeof value[9] !== 'boolean')) return null;
        return value.slice();
    }
    if (method === 'connection.flush') return Array.isArray(value) && value.length === 0 ? [] : null;
    if (method === 'events.poll') return allowEventsPollParams(value);
    if (method === 'player.setPos' || method === 'player.setPose') {
        const length = method === 'player.setPos' ? 4 : 6;
        return Array.isArray(value) && value.length === length && dimensionRef(value[0]) &&
            value.slice(1).every(finiteNumber) ? value.slice() : null;
    }
    return allowArrayParams(value);
};

const allowEvent = function (value) {
    if (!isObject(value) || !Number.isInteger(value.sequence) || value.sequence < 1 ||
        !canonicalResourceId(value.dimension)) return null;
    const origin = numberTuple(value.origin);
    if (!origin || !origin.every(Number.isInteger)) return null;
    const common = {sequence: value.sequence, type: value.type, dimension: value.dimension, origin};
    if (value.type === 'pickaxe_poke') {
        const pos = numberTuple(value.pos);
        const block = allowBlock(value.block, true);
        if (!hasExactFields(
            value, ['sequence', 'type', 'dimension', 'origin', 'pos', 'face', 'block', 'hand', 'item']
        ) ||
            !pos || !pos.every(Number.isInteger) || !faceToken(value.face) || !block ||
            (value.hand !== 'main' && value.hand !== 'off') || !canonicalResourceId(value.item)) return null;
        return Object.assign(common, {pos, face: value.face, block, hand: value.hand, item: value.item});
    }
    if (value.type === 'chat_posted') {
        if (!hasExactFields(value, ['sequence', 'type', 'dimension', 'origin', 'message']) ||
            typeof value.message !== 'string') return null;
        return Object.assign(common, {message: value.message});
    }
    if (value.type === 'projectile_hit') {
        const pos = numberTuple(value.pos);
        if (!hasExactFields(value, ['sequence', 'type', 'dimension', 'origin', 'projectile', 'pos', 'target']) ||
            !canonicalResourceId(value.projectile) || !pos || !isObject(value.target)) return null;
        let target;
        if (value.target.kind === 'player' && hasExactFields(value.target, ['kind'])) {
            target = {kind: 'player'};
        } else if (value.target.kind === 'entity' && hasExactFields(value.target, ['kind', 'handle']) &&
            typeof value.target.handle === 'string' && /^mcr_eh_[\x21-\x7e]+$/.test(value.target.handle)) {
            target = {kind: 'entity', handle: value.target.handle};
        } else if (value.target.kind === 'block' &&
            hasExactFields(value.target, ['kind', 'block', 'pos', 'face'])) {
            const targetBlock = allowBlock(value.target.block, true);
            const targetPos = numberTuple(value.target.pos);
            if (!targetBlock || !targetPos || !targetPos.every(Number.isInteger) ||
                (typeof value.target.face !== 'undefined' && !faceToken(value.target.face))) return null;
            target = {kind: 'block', block: targetBlock, pos: targetPos};
            if (typeof value.target.face === 'string') target.face = value.target.face;
        } else {
            return null;
        }
        return Object.assign(common, {projectile: value.projectile, pos, target});
    }
    return null;
};

const allowEventsPollResult = function (value) {
    const fields = ['events', 'through_sequence', 'latest_sequence', 'filtered_out',
        'overflow_dropped_total', 'capacity_dropped_total', 'explicitly_discarded_total'];
    if (!hasExactFields(value, fields) || Object.keys(value).length !== fields.length || !Array.isArray(value.events)) {
        return null;
    }
    const counters = fields.slice(1);
    if (!counters.every(field => Number.isInteger(value[field]) && value[field] >= 0) ||
        value.through_sequence > value.latest_sequence || value.filtered_out !== 0 ||
        value.explicitly_discarded_total !== 0) return null;
    const events = value.events.map(allowEvent);
    if (!events.every(Boolean)) return null;
    let priorSequence = 0;
    for (const event of events) {
        if (event.sequence <= priorSequence || event.sequence > value.through_sequence) return null;
        priorSequence = event.sequence;
    }
    return {
        events,
        through_sequence: value.through_sequence,
        latest_sequence: value.latest_sequence,
        filtered_out: 0,
        overflow_dropped_total: value.overflow_dropped_total,
        capacity_dropped_total: value.capacity_dropped_total,
        explicitly_discarded_total: 0
    };
};

const allowPosition = function (value) {
    if (!isObject(value)) return null;
    const dimension = optionalString(value.dimension);
    const pos = numberTuple(value.pos);
    return dimension && canonicalResourceId(dimension) && pos ? {dimension, pos} : null;
};

const allowBuildContext = function (value) {
    if (!hasExactFields(value, ['dimension', 'origin']) || Object.keys(value).length !== 2 ||
        !canonicalResourceId(value.dimension)) return null;
    const origin = numberTuple(value.origin);
    return origin ? {dimension: value.dimension, origin} : null;
};

const allowPose = function (value) {
    const position = allowPosition(value);
    if (!position || !finiteNumber(value.yaw) || !finiteNumber(value.pitch)) return null;
    return Object.assign(position, {yaw: value.yaw, pitch: value.pitch});
};

const allowError = function (value) {
    if (!isObject(value)) return null;
    const code = typeof value.code === 'string' || finiteNumber(value.code) ? value.code : null;
    const message = optionalString(value.message) || 'McRemote error';
    const error = {code, message};
    if (isObject(value.data)) {
        const data = {};
        if (typeof value.data.reason === 'string') data.reason = value.data.reason;
        if (typeof value.data.block_id === 'string') data.block_id = value.data.block_id;
        if (dimensionRef(value.data.dimension)) data.dimension = value.data.dimension;
        if (typeof value.data.property === 'string') data.property = value.data.property;
        if (typeof value.data.path === 'string') data.path = value.data.path;
        const rejectedValue = scalar(value.data.value);
        if (typeof rejectedValue !== 'undefined') data.value = rejectedValue;
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
        const params = allowParams(frame.method, payload.params);
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
    if (frame.method === 'player.getPose' || frame.method === 'player.setPose') {
        const result = allowPose(payload.result);
        return result ? {result} : null;
    }
    if (frame.method === 'build.setDimension' || frame.method === 'build.setOrigin') {
        const result = allowBuildContext(payload.result);
        return result ? {result} : null;
    }
    if (frame.method === 'world.setBlock' || frame.method === 'world.setBlocks' ||
        frame.method === 'connection.flush') return payload.result === null ? {result: null} : null;
    if (frame.method === 'world.getBlock') {
        const result = allowBlock(payload.result, true);
        return result ? {result} : null;
    }
    if (frame.method === 'world.getBlocks') {
        if (!Array.isArray(payload.result)) return null;
        const result = payload.result.map(item => allowBlock(item, true));
        return result.every(Boolean) ? {result} : null;
    }
    if (frame.method === 'world.getHeight') {
        return Number.isInteger(payload.result) ? {result: payload.result} : null;
    }
    if (frame.method === 'world.spawnParticle') {
        return Number.isInteger(payload.result) && payload.result >= 0 ? {result: payload.result} : null;
    }
    if (frame.method === 'world.spawnEntity') {
        return typeof payload.result === 'string' && /^mcr_eh_[\x21-\x7e]+$/.test(payload.result) ?
            {result: payload.result} : null;
    }
    if (frame.method === 'events.poll') {
        const result = allowEventsPollResult(payload.result);
        return result ? {result} : null;
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
    const isSetterNotification = frame.direction === 'send' && requestId === null &&
        (frame.method === 'world.setBlock' || frame.method === 'world.setBlocks');
    if (requestId === null && !isSetterNotification) return null;
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

// Trimmed from a non-negative integer to 0 for any observation that lacks a
// droppedFrames field (older Scratch build) or carries a malformed one,
// rather than forwarding a value WireScope's session envelope would reject.
const droppedFramesOf = observation => (
    isObject(observation) && Number.isInteger(observation.droppedFrames) && observation.droppedFrames >= 0 ?
        observation.droppedFrames :
        0
);

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
        target.droppedFrames = droppedFramesOf(currentObservation);
        const historyWindow = {dropped_frames: target.droppedFrames};
        for (const session of sessions) {
            postSession(session.port, {type: OBSERVER_SNAPSHOT, snapshot, history_window: historyWindow});
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
            postSession(session.port, {
                type: OBSERVER_SNAPSHOT,
                snapshot: target.snapshot,
                history_window: {dropped_frames: target.droppedFrames || 0}
            });
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

    const sourceApi = {
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
                    snapshot: null,
                    droppedFrames: 0
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
    environment.window.addEventListener('pagehide', sourceApi.destroy);
    return sourceApi;
};

const defaultEnvironment = () => ({
    window,
    MessageChannel: window.MessageChannel,
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
