import log from './log.js';
import {getMcRemoteRuntimeConfig} from './mcremote-runtime-config.js';

/**
 * Asks the browser to make this origin's storage (IndexedDB, localStorage,
 * etc.) persistent, i.e. exempt from WebKit's/Chromium's "evict after N days
 * of no interaction" storage pressure policies. Only takes effect when the
 * deployment's runtime config opts in via `storage_persist_enabled`, so that
 * different deployments (e.g. stable vs. beta) can be compared.
 *
 * The browser grants or denies this silently based on its own heuristics
 * (bookmarked, installed as a home-screen app, interaction history, etc.);
 * there is no way to force it and no user-visible prompt.
 * @returns {Promise<boolean|null>} true/false if the browser reported a
 *     result, or null if the API is unsupported or the deployment has not
 *     opted in.
 */
const requestBrowserStoragePersistence = () => {
    if (!getMcRemoteRuntimeConfig().storagePersistEnabled) return Promise.resolve(null);
    if (!(navigator.storage && navigator.storage.persist)) return Promise.resolve(null);
    return navigator.storage.persist()
        .catch(err => {
            log.warn(`requestBrowserStoragePersistence: ${err.message}`);
            return null;
        });
};

/**
 * Reports whether this origin's storage currently is persistent, regardless
 * of whether {@link requestBrowserStoragePersistence} was ever called: the
 * browser may grant persistence on its own heuristics.
 * @returns {Promise<boolean|null>} true/false if the browser reported a
 *     result, or null if the API is unsupported.
 */
const checkBrowserStoragePersisted = () => {
    if (!(navigator.storage && navigator.storage.persisted)) return Promise.resolve(null);
    return navigator.storage.persisted()
        .catch(err => {
            log.warn(`checkBrowserStoragePersisted: ${err.message}`);
            return null;
        });
};

export {
    checkBrowserStoragePersisted,
    requestBrowserStoragePersistence
};
