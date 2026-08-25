/**
 * Tracks which browser-saved-project record (see `indexeddb-project-store.js`)
 * the current editing session continues, across page reloads. This is a
 * small pointer only — never project data, a connection target, or a
 * McRemote/WireScope identity — so it is safe to keep in plain
 * `localStorage`, scoped like everything else here to this Editor origin.
 */
const STORAGE_KEY = 'scratch-gui.currentLocalProjectId';

const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    const randomPart = Math.random()
        .toString(36)
        .slice(2);
    return `local-${Date.now()}-${randomPart}`;
};

const readStoredId = () => {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        return null;
    }
};

const writeStoredId = id => {
    try {
        localStorage.setItem(STORAGE_KEY, id);
    } catch (e) {
        // Private browsing / storage disabled: the id just won't survive reload.
    }
};

/**
 * @returns {string} the id of the browser-saved-project record the current
 * session should keep overwriting, creating and persisting one if needed.
 */
const getOrCreateCurrentLocalProjectId = () => {
    const existing = readStoredId();
    if (existing) return existing;
    const id = generateId();
    writeStoredId(id);
    return id;
};

/**
 * Starts a fresh local project identity (a new browser-saved-project slot),
 * used when the editor begins showing a different project: a brand new
 * project, or one loaded from a `.sb3` file.
 * @returns {string} the newly assigned id.
 */
const startNewLocalProjectId = () => {
    const id = generateId();
    writeStoredId(id);
    return id;
};

/**
 * Continues an existing browser-saved-project slot after it has been
 * restored, so later autosaves keep overwriting that same record.
 * @param {string} id - the id of the record that was just restored.
 */
const continueLocalProjectId = id => {
    writeStoredId(id);
};

export {
    getOrCreateCurrentLocalProjectId,
    startNewLocalProjectId,
    continueLocalProjectId
};
