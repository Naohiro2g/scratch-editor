/**
 * Shared IndexedDB schema/open logic for this browser's local project and
 * sprite saves (McRemote save-track entry gate and b6 slice). Both
 * `indexeddb-project-store.js` and `indexeddb-sprite-store.js` open the same
 * database so that project and sprite saves share one storage-quota
 * accounting and one origin/storage-partition boundary, per the "browser
 *保存作品／ブラウザ保存スプライトは同じ基盤を再利用する" design decision — while
 * keeping project and sprite records in separate object stores (never mixed
 * into one schema).
 */

const DATABASE_NAME = 'scratch-gui-local-projects';
const DATABASE_VERSION = 2;
const PROJECTS_STORE = 'projects';
const SPRITES_STORE = 'sprites';

/**
 * @param {?IDBFactory} databaseFactory - injected for testability; falls
 * back to the global `indexedDB` when available.
 * @returns {Promise<?IDBDatabase>} resolves to null when IndexedDB is
 * unavailable in this environment, rather than rejecting.
 */
const openLocalDatabase = databaseFactory => {
    const factory = databaseFactory || (typeof indexedDB === 'undefined' ? null : indexedDB);
    if (!factory) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
                database.createObjectStore(PROJECTS_STORE, {keyPath: 'id'});
            }
            if (!database.objectStoreNames.contains(SPRITES_STORE)) {
                database.createObjectStore(SPRITES_STORE, {keyPath: 'id'});
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Unable to open local save database'));
    });
};

export {
    DATABASE_NAME,
    DATABASE_VERSION,
    PROJECTS_STORE,
    SPRITES_STORE,
    openLocalDatabase
};
