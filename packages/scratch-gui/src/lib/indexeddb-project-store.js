/**
 * Browser-local project storage (McRemote save-track entry gate).
 *
 * Stores whole-project `.sb3` snapshots in IndexedDB, scoped to this
 * browser's storage partition and this Editor origin. Never stores
 * credentials, a Minecraft connection target, tokens, or WireScope data —
 * only what `vm.saveProjectSb3()` already produces, plus a title/timestamp
 * for listing.
 *
 * Mirrors the open/transaction-wrapping style of
 * `scratch-vm/src/extensions/scratch3_mcremote/catalog.js`'s
 * `IndexedDBCatalogCache`, which is this codebase's only other IndexedDB
 * user. Shares its database (schema owned by `indexeddb-local-database.js`)
 * with `indexeddb-sprite-store.js`.
 */

import {PROJECTS_STORE, openLocalDatabase} from './indexeddb-local-database';

/**
 * @typedef {object} LocalProjectRecord
 * @property {string} id - locally-generated identifier, stable across saves.
 * @property {string} title - the project title at the time of the last save.
 * @property {number} updatedAt - `Date.now()` at the time of the last save.
 * @property {Blob} sb3 - the project, in the same `.sb3` blob shape
 * `vm.saveProjectSb3()` and `SB3Downloader` already produce.
 * @property {?string} thumbnail - optional data URI, same shape used by
 * the existing server-save thumbnail flow.
 */

const isValidRecord = record => Boolean(
    record &&
    typeof record.id === 'string' &&
    typeof record.updatedAt === 'number' &&
    record.sb3 instanceof Blob &&
    record.sb3.size > 0
);

class IndexedDBProjectStore {
    /**
     * @param {?IDBFactory} databaseFactory - injected for testability; falls
     * back to the global `indexedDB` when available (mirrors
     * `IndexedDBCatalogCache`'s constructor).
     */
    constructor (databaseFactory) {
        this._databaseFactory = databaseFactory || (typeof indexedDB === 'undefined' ? null : indexedDB);
        this._databasePromise = null;
    }

    /**
     * @returns {boolean} whether this environment can actually persist anything.
     */
    isAvailable () {
        return Boolean(this._databaseFactory);
    }

    _open () {
        if (!this._databaseFactory) return Promise.resolve(null);
        if (!this._databasePromise) {
            this._databasePromise = openLocalDatabase(this._databaseFactory);
        }
        return this._databasePromise;
    }

    /**
     * List saved projects, most recently updated first. Corrupt records
     * (failed shape validation) are reported separately rather than thrown
     * away, so a caller can surface "this save is damaged" instead of
     * silently losing track of it.
     * @returns {Promise<{records: LocalProjectRecord[], corruptIds: string[]}>}
     */
    list () {
        return this._open().then(database => {
            if (!database) return {records: [], corruptIds: []};
            return new Promise((resolve, reject) => {
                const request = database.transaction(PROJECTS_STORE, 'readonly')
                    .objectStore(PROJECTS_STORE)
                    .getAll();
                request.onsuccess = () => {
                    const records = [];
                    const corruptIds = [];
                    for (const entry of request.result || []) {
                        if (isValidRecord(entry)) {
                            records.push(entry);
                        } else if (entry && typeof entry.id === 'string') {
                            corruptIds.push(entry.id);
                        }
                    }
                    records.sort((a, b) => b.updatedAt - a.updatedAt);
                    resolve({records, corruptIds});
                };
                request.onerror = () => reject(request.error || new Error('Unable to list local projects'));
            });
        });
    }

    /**
     * @param {string} id - record id.
     * @returns {Promise<?LocalProjectRecord>} the record, or null if absent
     * or corrupt (callers that need to distinguish "absent" from "corrupt"
     * should use `list()`).
     */
    get (id) {
        return this._open().then(database => {
            if (!database) return null;
            return new Promise((resolve, reject) => {
                const request = database.transaction(PROJECTS_STORE, 'readonly')
                    .objectStore(PROJECTS_STORE)
                    .get(id);
                request.onsuccess = () => {
                    const record = request.result;
                    resolve(isValidRecord(record) ? record : null);
                };
                request.onerror = () => reject(request.error || new Error('Unable to read local project'));
            });
        });
    }

    /**
     * Write a project snapshot. Callers must only call this with an `sb3`
     * blob that already serialized successfully — a failed
     * `vm.saveProjectSb3()` must never reach this method, so that a
     * mid-save failure cannot clobber the last-known-good snapshot on disk.
     * @param {LocalProjectRecord} record - record to write.
     * @returns {Promise<void>}
     */
    put (record) {
        if (!isValidRecord(record)) {
            return Promise.reject(new Error('Refusing to write an invalid local project record'));
        }
        return this._open().then(database => {
            if (!database) throw new Error('IndexedDB is not available in this environment');
            return new Promise((resolve, reject) => {
                let transaction;
                try {
                    transaction = database.transaction(PROJECTS_STORE, 'readwrite');
                } catch (err) {
                    reject(err);
                    return;
                }
                transaction.objectStore(PROJECTS_STORE).put(record);
                transaction.oncomplete = () => resolve();
                // A quota-exceeded write throws inside the transaction and
                // surfaces as transaction.error; propagate it as-is (rather
                // than mapping it) so callers can check `error.name ===
                // 'QuotaExceededError'`. We never react to this by deleting
                // other stored projects.
                transaction.onerror = () => reject(transaction.error || new Error('Unable to write local project'));
                transaction.onabort = () => reject(transaction.error || new Error('Local project write was aborted'));
            });
        });
    }

    /**
     * @param {string} id - record id.
     * @returns {Promise<void>}
     */
    remove (id) {
        return this._open().then(database => {
            if (!database) return;
            return new Promise((resolve, reject) => {
                const transaction = database.transaction(PROJECTS_STORE, 'readwrite');
                transaction.objectStore(PROJECTS_STORE).delete(id);
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error || new Error('Unable to delete local project'));
                transaction.onabort = () => reject(transaction.error || new Error('Local project delete was aborted'));
            });
        });
    }
}

export default IndexedDBProjectStore;
