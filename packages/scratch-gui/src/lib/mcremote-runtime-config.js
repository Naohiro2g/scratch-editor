import log from './log.js';

const DEFAULT_CONNECTION_TARGETS = Object.freeze([
    Object.freeze({id: 'stable', sandboxRoute: 'sb.mc-remote.com'})
]);

const DEFAULT_RUNTIME_CONFIG = Object.freeze({
    bridgeUrl: 'wss://bridge.mc-remote.com',
    defaultSandbox: 'sb.mc-remote.com',
    connectionTargets: DEFAULT_CONNECTION_TARGETS,
    connectionEnabled: true,
    releaseIdentity: 'embedded-default'
});

const UNAVAILABLE_RUNTIME_CONFIG = Object.freeze({
    ...DEFAULT_RUNTIME_CONFIG,
    connectionEnabled: false,
    releaseIdentity: 'runtime-config-unavailable'
});

let currentRuntimeConfig = DEFAULT_RUNTIME_CONFIG;

const normalizeConnectionTargets = value => {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('connection_targets must be a non-empty array');
    }
    const ids = new Set();
    const sandboxRoutes = new Set();
    return Object.freeze(value.map((target, index) => {
        if (!target || typeof target !== 'object') {
            throw new Error(`connection_targets[${index}] must be an object`);
        }
        const id = typeof target.id === 'string' ? target.id.trim() : '';
        const sandboxRoute = typeof target.sandbox === 'string' ? target.sandbox.trim() : '';
        if (!id || !sandboxRoute) {
            throw new Error(`connection_targets[${index}] must have non-empty id and sandbox values`);
        }
        if (ids.has(id)) throw new Error(`connection_targets contains duplicate id: ${id}`);
        if (sandboxRoutes.has(sandboxRoute)) {
            throw new Error(`connection_targets contains duplicate sandbox: ${sandboxRoute}`);
        }
        ids.add(id);
        sandboxRoutes.add(sandboxRoute);
        return Object.freeze({id, sandboxRoute});
    }));
};

const normalizeRuntimeConfig = value => {
    if (!value || typeof value !== 'object') {
        throw new Error('configuration must be an object');
    }
    const bridgeUrl = new URL(value.bridge_url);
    if (bridgeUrl.protocol !== 'wss:' || bridgeUrl.username || bridgeUrl.password || bridgeUrl.hash) {
        throw new Error('bridge_url must be a WSS URL without credentials or a fragment');
    }
    if (typeof value.default_sandbox !== 'string' || !value.default_sandbox.trim()) {
        throw new Error('default_sandbox must be a non-empty string');
    }
    const defaultSandbox = value.default_sandbox.trim();
    const connectionTargets = normalizeConnectionTargets(value.connection_targets);
    if (!connectionTargets.some(target => target.sandboxRoute === defaultSandbox)) {
        throw new Error('default_sandbox must be listed in connection_targets');
    }
    if (typeof value.connection_enabled !== 'boolean') {
        throw new Error('connection_enabled must be a boolean');
    }
    if (typeof value.release_identity !== 'string' || !value.release_identity.trim()) {
        throw new Error('release_identity must be a non-empty string');
    }
    return Object.freeze({
        bridgeUrl: bridgeUrl.toString(),
        defaultSandbox,
        connectionTargets,
        connectionEnabled: value.connection_enabled,
        releaseIdentity: value.release_identity.trim()
    });
};

const runtimeConfigUrl = () => new URL('mc-remote-runtime-config.json', window.location.href).toString();

const loadMcRemoteRuntimeConfig = () => {
    const url = runtimeConfigUrl();
    return Promise.resolve()
        .then(() => fetch(url, {cache: 'no-store', credentials: 'same-origin'}))
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(value => {
            currentRuntimeConfig = normalizeRuntimeConfig(value);
            return currentRuntimeConfig;
        })
        .catch(error => {
            log.warn(`loadMcRemoteRuntimeConfig: ${url}: ${error.message}`);
            currentRuntimeConfig = UNAVAILABLE_RUNTIME_CONFIG;
            return currentRuntimeConfig;
        });
};

const getMcRemoteRuntimeConfig = () => currentRuntimeConfig;

export {
    getMcRemoteRuntimeConfig,
    loadMcRemoteRuntimeConfig
};
