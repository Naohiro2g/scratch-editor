import log from './log.js';

const DEFAULT_RUNTIME_CONFIG = Object.freeze({
    bridgeUrl: 'wss://bridge.mc-remote.com',
    defaultSandbox: 'sb.mc-remote.com',
    connectionEnabled: true,
    releaseIdentity: 'embedded-default'
});

const UNAVAILABLE_RUNTIME_CONFIG = Object.freeze({
    ...DEFAULT_RUNTIME_CONFIG,
    connectionEnabled: false,
    releaseIdentity: 'runtime-config-unavailable'
});

let currentRuntimeConfig = DEFAULT_RUNTIME_CONFIG;

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
    if (typeof value.connection_enabled !== 'boolean') {
        throw new Error('connection_enabled must be a boolean');
    }
    if (typeof value.release_identity !== 'string' || !value.release_identity.trim()) {
        throw new Error('release_identity must be a non-empty string');
    }
    return Object.freeze({
        bridgeUrl: bridgeUrl.toString(),
        defaultSandbox: value.default_sandbox.trim(),
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
