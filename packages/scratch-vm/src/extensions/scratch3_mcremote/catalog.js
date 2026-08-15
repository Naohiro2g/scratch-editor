let TextEncoderImplementation;
if (typeof TextEncoder === 'undefined') {
    TextEncoderImplementation = require('text-encoding').TextEncoder;
} else {
    TextEncoderImplementation = TextEncoder;
}

const DATABASE_NAME = 'mcremote-catalogs-v1';
const DATABASE_VERSION = 1;
const CATALOG_STORE = 'catalogs';
const RESOURCE_ID_PATTERN = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/;

const CatalogStatus = {
    NOT_ACQUIRED: 'not_acquired',
    CURRENT: 'current',
    UNAVAILABLE: 'unavailable'
};

const CatalogSource = {
    CACHE: 'cache',
    NETWORK: 'network'
};

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const catalogError = (message, reason) => {
    const error = new Error(message);
    error.reason = reason;
    return error;
};

/**
 * Serialize a JSON value with recursively sorted object keys and compact separators.
 * Arrays retain their wire order.
 * @param {unknown} value JSON value to serialize.
 * @returns {string} canonical JSON.
 */
const canonicalStringify = value => {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalStringify).join(',')}]`;
    }
    if (isObject(value)) {
        return `{${Object.keys(value).sort()
            .map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
};

/**
 * @param {string} value UTF-8 input.
 * @returns {Promise<string>} lower-case SHA-256 hex digest.
 */
const sha256Hex = value => {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        return Promise.reject(catalogError('SHA-256 is unavailable', 'catalog_hash_unavailable'));
    }
    const bytes = new TextEncoderImplementation().encode(value);
    return crypto.subtle.digest('SHA-256', bytes).then(digest =>
        Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    );
};

const scalarType = value => {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number' && Number.isFinite(value)) return 'number';
    if (typeof value === 'string') return 'string';
    return null;
};

const scalarKey = value => `${scalarType(value)}:${JSON.stringify(value)}`;

const validateBlockEntry = entry => {
    if (!isObject(entry) || !isObject(entry.states) || !isObject(entry.default_state)) return false;
    const stateKeys = Object.keys(entry.states).sort();
    const defaultKeys = Object.keys(entry.default_state).sort();
    if (stateKeys.length !== defaultKeys.length || stateKeys.some((key, index) => key !== defaultKeys[index])) {
        return false;
    }
    return stateKeys.every(key => {
        const allowed = entry.states[key];
        if (!Array.isArray(allowed) || allowed.length === 0) return false;
        const type = scalarType(allowed[0]);
        if (!type || allowed.some(value => scalarType(value) !== type)) return false;
        const uniqueValues = new Set(allowed.map(scalarKey));
        if (uniqueValues.size !== allowed.length) return false;
        return scalarType(entry.default_state[key]) === type &&
            uniqueValues.has(scalarKey(entry.default_state[key]));
    });
};

const validateResourceMap = (resources, validateEntry) => isObject(resources) &&
    Object.keys(resources).every(id => RESOURCE_ID_PATTERN.test(id) && validateEntry(resources[id]));

const catalogBody = result => ({
    block: result.block,
    entity: result.entity,
    particle: result.particle
});

/**
 * Validate a catalog response against the hash advertised by hello.
 * Unknown fields are retained and included in the canonical body only when
 * they are nested below block/entity/particle, matching the wire hash contract.
 * @param {object} result catalog.get result.
 * @param {string} expectedHash hash advertised by hello.
 * @param {function(string): Promise<string>} [digest] SHA-256 implementation.
 * @returns {Promise<object>} the validated result.
 */
const validateCatalogResult = (result, expectedHash, digest = sha256Hex) => {
    const normalizedExpectedHash = typeof expectedHash === 'string' ? expectedHash.toLowerCase() : '';
    const resultHash = result && typeof result.catalogHash === 'string' ? result.catalogHash.toLowerCase() : '';
    if (!/^[0-9a-f]{64}$/.test(normalizedExpectedHash) || resultHash !== normalizedExpectedHash) {
        return Promise.reject(catalogError('Catalog hash does not match hello', 'catalog_hash_mismatch'));
    }
    if (
        !validateResourceMap(result.block, validateBlockEntry) ||
        !validateResourceMap(result.entity, isObject) ||
        !validateResourceMap(result.particle, isObject)
    ) {
        return Promise.reject(catalogError('Catalog response has an invalid schema', 'invalid_catalog'));
    }
    return digest(canonicalStringify(catalogBody(result))).then(actualHash => {
        if (actualHash.toLowerCase() !== normalizedExpectedHash) {
            throw catalogError('Catalog content does not match its hash', 'catalog_hash_mismatch');
        }
        return result;
    });
};

/**
 * Use the short input form only for Minecraft's special default namespace.
 * @param {string} id fully-qualified catalog block id.
 * @returns {string} picker input form.
 */
const pickerBlockId = id => (
    id.indexOf('minecraft:') === 0 ? id.slice('minecraft:'.length) : id
);

class IndexedDBCatalogCache {
    constructor (databaseFactory) {
        this._databaseFactory = databaseFactory || (typeof indexedDB === 'undefined' ? null : indexedDB);
        this._databasePromise = null;
    }

    _open () {
        if (!this._databaseFactory) return Promise.resolve(null);
        if (this._databasePromise) return this._databasePromise;
        this._databasePromise = new Promise((resolve, reject) => {
            const request = this._databaseFactory.open(DATABASE_NAME, DATABASE_VERSION);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(CATALOG_STORE)) {
                    request.result.createObjectStore(CATALOG_STORE);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Unable to open catalog cache'));
        });
        return this._databasePromise;
    }

    get (catalogHash) {
        return this._open().then(database => {
            if (!database) return null;
            return new Promise((resolve, reject) => {
                const request = database.transaction(CATALOG_STORE, 'readonly')
                    .objectStore(CATALOG_STORE)
                    .get(catalogHash);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error || new Error('Unable to read catalog cache'));
            });
        });
    }

    set (catalogHash, catalog) {
        return this._open().then(database => {
            if (!database) return false;
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(CATALOG_STORE, 'readwrite');
                transaction.objectStore(CATALOG_STORE).put(catalog, catalogHash);
                transaction.oncomplete = () => resolve(true);
                transaction.onerror = () => reject(transaction.error || new Error('Unable to write catalog cache'));
                transaction.onabort = () => reject(transaction.error || new Error('Catalog cache write was aborted'));
            });
        });
    }
}

module.exports = {
    CatalogSource,
    CatalogStatus,
    IndexedDBCatalogCache,
    canonicalStringify,
    pickerBlockId,
    sha256Hex,
    validateCatalogResult
};
