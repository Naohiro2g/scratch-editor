import {MCREMOTE_CLIENT_VERSION} from '@scratch/scratch-vm';
import Ajv from 'ajv';

import productConfigSchema from '../../contracts/product-config/schema.json';
import runtimeConfigSchema from '../../contracts/runtime-config/schema.json';
import log from './log.js';

const EMPTY_NOTICES = Object.freeze([]);
const EMPTY_TARGETS = Object.freeze([]);
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

const ajv = new Ajv({allErrors: true, strict: true});
const validateProductConfig = ajv.compile(productConfigSchema);
const validateRuntimeConfig = ajv.compile(runtimeConfigSchema);

const EMPTY_PRODUCT_CONFIG = Object.freeze({
    homepageUrl: null,
    notices: EMPTY_NOTICES
});

const UNAVAILABLE_RUNTIME_CONFIG = Object.freeze({
    bridgeUrl: null,
    defaultSandbox: null,
    connectionTargets: EMPTY_TARGETS,
    connectionEnabled: false,
    wireScopeUrl: null,
    releaseIdentity: MCREMOTE_CLIENT_VERSION,
    notices: EMPTY_NOTICES,
    storagePersistEnabled: false
});

let currentRuntimeConfig = Object.freeze({
    ...UNAVAILABLE_RUNTIME_CONFIG,
    ...EMPTY_PRODUCT_CONFIG
});

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

const assertSchema = (validate, value, configName) => {
    if (validate(value)) return;
    throw new Error(`${configName} ${ajv.errorsText(validate.errors)}`);
};

// Rest destructuring preserves single-argument semantics under both active arrow-parens rules.
const normalizeConnectionTargets = (...[value]) => {
    const ids = new Set();
    const sandboxRoutes = new Set();
    return Object.freeze(value.map((target, index) => {
        const id = target.id.trim();
        const sandboxRoute = target.sandbox.trim();
        const label = target.label.trim();
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
    if (typeof link === 'undefined') return null;
    const href = link.href.trim();
    const label = link.label.trim();
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

const normalizeNotices = (...[value]) => Object.freeze((value || []).map((notice, index) => {
    const heading = notice.heading.trim();
    const body = notice.body.trim();
    if (!heading || !body) {
        throw new Error(`notices[${index}] must have non-empty heading and body`);
    }
    return Object.freeze({heading, body, link: normalizeNoticeLink(notice.link, index)});
}));

const normalizeRuntimeConfig = (...[value]) => {
    assertSchema(validateRuntimeConfig, value, 'runtime config');
    const notices = normalizeNotices(value.notices);
    const storagePersistEnabled = value.storage_persist_enabled || false;
    if (!value.connection_enabled) {
        return Object.freeze({
            ...UNAVAILABLE_RUNTIME_CONFIG,
            notices,
            storagePersistEnabled
        });
    }

    const bridgeUrl = new URL(value.bridge_url);
    const pageUrl = new URL(window.location.href);
    if (!isAllowedBridgeUrl(bridgeUrl, pageUrl) || bridgeUrl.username || bridgeUrl.password || bridgeUrl.hash) {
        throw new Error(
            'bridge_url must be WSS, or WS between an HTTP loopback page and loopback bridge, ' +
            'without credentials or a fragment'
        );
    }
    const defaultSandbox = value.default_sandbox.trim();
    const connectionTargets = normalizeConnectionTargets(value.connection_targets);
    if (!connectionTargets.some(({sandboxRoute}) => sandboxRoute === defaultSandbox)) {
        throw new Error('default_sandbox must be listed in connection_targets');
    }

    let wireScopeUrl = null;
    if (typeof value.wirescope_url !== 'undefined') {
        const candidate = new URL(value.wirescope_url);
        if (!isAllowedWireScopeUrl(candidate, pageUrl)) {
            throw new Error(
                'wirescope_url must be a distinct HTTPS origin, or a distinct HTTP loopback origin, ' +
                'without credentials, query, or fragment'
            );
        }
        wireScopeUrl = candidate.toString();
    }
    return Object.freeze({
        bridgeUrl: bridgeUrl.toString(),
        defaultSandbox,
        connectionTargets,
        connectionEnabled: true,
        wireScopeUrl,
        releaseIdentity: MCREMOTE_CLIENT_VERSION,
        notices,
        storagePersistEnabled
    });
};

const normalizeProductConfig = (...[value]) => {
    assertSchema(validateProductConfig, value, 'product config');
    const candidate = new URL(value.homepage_url);
    if (candidate.protocol !== 'https:' && candidate.protocol !== 'http:') {
        throw new Error('homepage_url must use http or https');
    }
    return Object.freeze({
        homepageUrl: candidate.toString(),
        notices: normalizeNotices(value.notices)
    });
};

const configUrl = fileName => new URL(fileName, window.location.href).toString();

const loadConfig = (fileName, normalize, fallback) => {
    const url = configUrl(fileName);
    return Promise.resolve()
        .then(() => fetch(url, {cache: 'no-store', credentials: 'same-origin'}))
        .then((...[response]) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(normalize)
        .catch(({message}) => {
            log.warn(`loadMcRemoteRuntimeConfig: ${url}: ${message}`);
            return fallback;
        });
};

const loadMcRemoteRuntimeConfig = () => Promise.all([
    loadConfig('mc-remote-runtime-config.json', normalizeRuntimeConfig, UNAVAILABLE_RUNTIME_CONFIG),
    loadConfig('mc-remote-product-config.json', normalizeProductConfig, EMPTY_PRODUCT_CONFIG)
]).then(([runtimeConfig, productConfig]) => {
    currentRuntimeConfig = Object.freeze({
        ...runtimeConfig,
        homepageUrl: productConfig.homepageUrl,
        notices: Object.freeze([...runtimeConfig.notices, ...productConfig.notices])
    });
    return currentRuntimeConfig;
});

const getMcRemoteRuntimeConfig = () => currentRuntimeConfig;

export {
    getMcRemoteRuntimeConfig,
    isAllowedBridgeUrl,
    isAllowedWireScopeUrl,
    loadMcRemoteRuntimeConfig
};
