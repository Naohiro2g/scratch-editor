/**
 * Browser-local sprite storage (b6: reuses the entry gate's IndexedDB
 * foundation and record shape rather than inventing a new one — see
 * `indexeddb-project-store.js` and `indexeddb-local-database.js`).
 *
 * Stores single-sprite `.sprite3` snapshots, explicitly saved by the user
 * (via the sprite context menu), scoped to this browser's storage partition
 * and this Editor origin. Never stores credentials, a Minecraft connection
 * target, tokens, or WireScope data — only what `vm.exportSprite()` already
 * produces, plus a name/timestamp for listing.
 */

import {SPRITES_STORE, openLocalDatabase} from './indexeddb-local-database';

/**
 * @typedef {object} LocalSpriteRecord
 * @property {string} id - locally-generated identifier, stable across saves.
 * @property {string} name - the sprite's name at the time of the last save.
 * @property {number} updatedAt - `Date.now()` at the time of the last save.
 * @property {Blob} sprite3 - the sprite, in the same `.sprite3` blob shape
 * `vm.exportSprite()` already produces.
 * @property {?string} thumbnail - optional data URI.
 */

const isValidRecord = record => Boolean(
    record &&
    typeof record.id === 'string' &&
    typeof record.updatedAt === 'number' &&
    record.sprite3 instanceof Blob &&
    record.sprite3.size > 0
);

class IndexedDBSpriteStore {
    /**
     * @param {?IDBFactory} databaseFactory - injected for testability; falls
     * back to the global `indexedDB` when available.
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
     * List saved sprites, most recently updated first. Corrupt records
     * (failed shape validation) are reported separately rather than thrown
     * away, mirroring `IndexedDBProjectStore.list()`.
     * @returns {Promise<{records: LocalSpriteRecord[], corruptIds: string[]}>}
     */
    list () {
        return this._open().then(database => {
            if (!database) return {records: [], corruptIds: []};
            return new Promise((resolve, reject) => {
                const request = database.transaction(SPRITES_STORE, 'readonly')
                    .objectStore(SPRITES_STORE)
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
                request.onerror = () => reject(request.error || new Error('Unable to list local sprites'));
            });
        });
    }

    /**
     * @param {string} id - record id.
     * @returns {Promise<?LocalSpriteRecord>} the record, or null if absent
     * or corrupt.
     */
    get (id) {
        return this._open().then(database => {
            if (!database) return null;
            return new Promise((resolve, reject) => {
                const request = database.transaction(SPRITES_STORE, 'readonly')
                    .objectStore(SPRITES_STORE)
                    .get(id);
                request.onsuccess = () => {
                    const record = request.result;
                    resolve(isValidRecord(record) ? record : null);
                };
                request.onerror = () => reject(request.error || new Error('Unable to read local sprite'));
            });
        });
    }

    /**
     * Write a sprite snapshot. Callers must only call this with a
     * `sprite3` blob that already serialized successfully, so a failed
     * `vm.exportSprite()` can't clobber the last-known-good snapshot on
     * disk.
     * @param {LocalSpriteRecord} record - record to write.
     * @returns {Promise<void>}
     */
    put (record) {
        if (!isValidRecord(record)) {
            return Promise.reject(new Error('Refusing to write an invalid local sprite record'));
        }
        return this._open().then(database => {
            if (!database) throw new Error('IndexedDB is not available in this environment');
            return new Promise((resolve, reject) => {
                let transaction;
                try {
                    transaction = database.transaction(SPRITES_STORE, 'readwrite');
                } catch (err) {
                    reject(err);
                    return;
                }
                transaction.objectStore(SPRITES_STORE).put(record);
                transaction.oncomplete = () => resolve();
                // A quota-exceeded write throws inside the transaction and
                // surfaces as transaction.error; propagate it as-is. We
                // never react to this by deleting other stored sprites.
                transaction.onerror = () => reject(transaction.error || new Error('Unable to write local sprite'));
                transaction.onabort = () => reject(transaction.error || new Error('Local sprite write was aborted'));
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
                const transaction = database.transaction(SPRITES_STORE, 'readwrite');
                transaction.objectStore(SPRITES_STORE).delete(id);
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error || new Error('Unable to delete local sprite'));
                transaction.onabort = () => reject(transaction.error || new Error('Local sprite delete was aborted'));
            });
        });
    }
}

export default IndexedDBSpriteStore;
