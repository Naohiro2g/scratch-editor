import log from './log.js';

const DEFAULT_CONNECTION_TARGETS = Object.freeze([
    Object.freeze({id: 'stable', sandboxRoute: 'sb.mc-remote.com', label: 'Stable'})
]);

const EMPTY_NOTICES = Object.freeze([]);
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

const DEFAULT_RUNTIME_CONFIG = Object.freeze({
    bridgeUrl: 'wss://bridge.mc-remote.com',
    defaultSandbox: 'sb.mc-remote.com',
    connectionTargets: DEFAULT_CONNECTION_TARGETS,
    connectionEnabled: true,
    wireScopeUrl: null,
    releaseIdentity: 'embedded-default',
    homepageUrl: null,
    notices: EMPTY_NOTICES
});

const UNAVAILABLE_RUNTIME_CONFIG = Object.freeze({
    ...DEFAULT_RUNTIME_CONFIG,
    connectionEnabled: false,
    releaseIdentity: 'runtime-config-unavailable'
});

let currentRuntimeConfig = DEFAULT_RUNTIME_CONFIG;

const isAllowedBridgeUrl = (bridgeUrl, pageUrl) => bridgeUrl.protocol === 'wss:' || (
    bridgeUrl.protocol === 'ws:' &&
    pageUrl.protocol === 'http:' &&
    LOOPBACK_HOSTNAMES.has(pageUrl.hostname) &&
    LOOPBACK_HOSTNAMES.has(bridgeUrl.hostname)
);

const isAllowedWireScopeUrl = (wireScopeUrl, pageUrl) => wireScopeUrl.origin !== pageUrl.origin && (
    wireScopeUrl.protocol === 'https:' || (
        wireScopeUrl.protocol === 'http:' &&
        pageUrl.protocol === 'http:' &&
        LOOPBACK_HOSTNAMES.has(pageUrl.hostname) &&
        LOOPBACK_HOSTNAMES.has(wireScopeUrl.hostname)
    )
) && !wireScopeUrl.username && !wireScopeUrl.password && !wireScopeUrl.search && !wireScopeUrl.hash;

// Rest destructuring preserves single-argument semantics under both active arrow-parens rules.
const normalizeConnectionTargets = (...[value]) => {
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
        const label = typeof target.label === 'string' ? target.label.trim() : '';
        if (!id || !sandboxRoute || !label) {
            throw new Error(`connection_targets[${index}] must have non-empty id, label, and sandbox values`);
        }
        if (ids.has(id)) throw new Error(`connection_targets contains duplicate id: ${id}`);
        if (sandboxRoutes.has(sandboxRoute)) {
            throw new Error(`connection_targets contains duplicate sandbox: ${sandboxRoute}`);
        }
        ids.add(id);
        sandboxRoutes.add(sandboxRoute);
        return Object.freeze({id, sandboxRoute, label});
    }));
};

const normalizeNoticeLink = (link, index) => {
    if (typeof link === 'undefined' || link === null) return null;
    if (typeof link !== 'object') {
        throw new Error(`notices[${index}].link must be an object`);
    }
    const href = typeof link.href === 'string' ? link.href.trim() : '';
    const label = typeof link.label === 'string' ? link.label.trim() : '';
    if (!href || !label) {
        throw new Error(`notices[${index}].link must have non-empty href and label`);
    }
    let url;
    try {
        url = new URL(href);
    } catch {
        throw new Error(`notices[${index}].link.href must be an absolute URL`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error(`notices[${index}].link.href must use http or https`);
    }
    return Object.freeze({href: url.toString(), label});
};

const normalizeNotices = (...[value]) => {
    if (typeof value === 'undefined') return EMPTY_NOTICES;
    if (!Array.isArray(value)) {
        throw new Error('notices must be an array');
    }
    return Object.freeze(value.map((notice, index) => {
        if (!notice || typeof notice !== 'object') {
            throw new Error(`notices[${index}] must be an object`);
        }
        const heading = typeof notice.heading === 'string' ? notice.heading.trim() : '';
        const body = typeof notice.body === 'string' ? notice.body.trim() : '';
        if (!heading || !body) {
            throw new Error(`notices[${index}] must have non-empty heading and body`);
        }
        return Object.freeze({heading, body, link: normalizeNoticeLink(notice.link, index)});
    }));
};

const normalizeRuntimeConfig = (...[value]) => {
    if (!value || typeof value !== 'object') {
        throw new Error('configuration must be an object');
    }
    const bridgeUrl = new URL(value.bridge_url);
    const pageUrl = new URL(window.location.href);
    if (!isAllowedBridgeUrl(bridgeUrl, pageUrl) || bridgeUrl.username || bridgeUrl.password || bridgeUrl.hash) {
        throw new Error(
            'bridge_url must be WSS, or WS between an HTTP loopback page and loopback bridge, ' +
            'without credentials or a fragment'
        );
    }
    if (typeof value.default_sandbox !== 'string' || !value.default_sandbox.trim()) {
        throw new Error('default_sandbox must be a non-empty string');
    }
    const defaultSandbox = value.default_sandbox.trim();
    const connectionTargets = normalizeConnectionTargets(value.connection_targets);
    if (!connectionTargets.some(({sandboxRoute}) => sandboxRoute === defaultSandbox)) {
        throw new Error('default_sandbox must be listed in connection_targets');
    }
    if (typeof value.connection_enabled !== 'boolean') {
        throw new Error('connection_enabled must be a boolean');
    }
    if (typeof value.release_identity !== 'string' || !value.release_identity.trim()) {
        throw new Error('release_identity must be a non-empty string');
    }
    let wireScopeUrl = null;
    if (typeof value.wirescope_url !== 'undefined' && value.wirescope_url !== null) {
        const candidate = new URL(value.wirescope_url);
        if (!isAllowedWireScopeUrl(candidate, pageUrl)) {
            throw new Error(
                'wirescope_url must be a distinct HTTPS origin, or a distinct HTTP loopback origin, ' +
                'without credentials, query, or fragment'
            );
        }
        wireScopeUrl = candidate.toString();
    }
    let homepageUrl = null;
    if (typeof value.homepage_url !== 'undefined' && value.homepage_url !== null) {
        const candidate = new URL(value.homepage_url);
        if (candidate.protocol !== 'https:' && candidate.protocol !== 'http:') {
            throw new Error('homepage_url must use http or https');
        }
        homepageUrl = candidate.toString();
    }
    const notices = normalizeNotices(value.notices);
    return Object.freeze({
        bridgeUrl: bridgeUrl.toString(),
        defaultSandbox,
        connectionTargets,
        connectionEnabled: value.connection_enabled,
        wireScopeUrl,
        releaseIdentity: value.release_identity.trim(),
        homepageUrl,
        notices
    });
};

const runtimeConfigUrl = () => new URL('mc-remote-runtime-config.json', window.location.href).toString();

const loadMcRemoteRuntimeConfig = () => {
    const url = runtimeConfigUrl();
    return Promise.resolve()
        .then(() => fetch(url, {cache: 'no-store', credentials: 'same-origin'}))
        .then((...[response]) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then((...[value]) => {
            currentRuntimeConfig = normalizeRuntimeConfig(value);
            return currentRuntimeConfig;
        })
        .catch(({message}) => {
            log.warn(`loadMcRemoteRuntimeConfig: ${url}: ${message}`);
            currentRuntimeConfig = UNAVAILABLE_RUNTIME_CONFIG;
            return currentRuntimeConfig;
        });
};

const getMcRemoteRuntimeConfig = () => currentRuntimeConfig;

export {
    getMcRemoteRuntimeConfig,
    isAllowedBridgeUrl,
    isAllowedWireScopeUrl,
    loadMcRemoteRuntimeConfig
};
