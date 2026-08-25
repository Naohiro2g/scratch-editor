/**
 * Redux state for the browser-saved-project list (McRemote save-track entry
 * gate). Only record metadata (id, title, updatedAt, thumbnail) lives here;
 * the `.sb3` payload itself stays in IndexedDB and is fetched on demand by
 * `indexeddb-project-store.js`, so this state stays small and serializable.
 *
 * Restore/delete follow this codebase's existing menu-action pattern (see
 * `manualUpdateProject`/`isManualUpdating` in `project-state.js`): a menu
 * click dispatches a plain "this id was requested" action, and
 * `local-project-saver-hoc.jsx` reacts to the resulting state change to do
 * the actual (async, IndexedDB-backed) work, rather than being called
 * directly.
 */
const UPDATE_LOCAL_PROJECTS_LIST = 'scratch-gui/local-projects/UPDATE_LOCAL_PROJECTS_LIST';
const SET_LOCAL_PROJECTS_BUSY = 'scratch-gui/local-projects/SET_LOCAL_PROJECTS_BUSY';
const SET_LOCAL_PROJECTS_ERROR = 'scratch-gui/local-projects/SET_LOCAL_PROJECTS_ERROR';
const SET_LOCAL_PROJECTS_IDLE = 'scratch-gui/local-projects/SET_LOCAL_PROJECTS_IDLE';
const REQUEST_RESTORE_LOCAL_PROJECT = 'scratch-gui/local-projects/REQUEST_RESTORE_LOCAL_PROJECT';
const REQUEST_DELETE_LOCAL_PROJECT = 'scratch-gui/local-projects/REQUEST_DELETE_LOCAL_PROJECT';

const LocalProjectsStatus = {
    IDLE: 'idle',
    BUSY: 'busy',
    ERROR: 'error'
};

const initialState = {
    status: LocalProjectsStatus.IDLE,
    records: [],
    corruptIds: [],
    error: null,
    pendingRestoreId: null,
    pendingDeleteId: null
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case UPDATE_LOCAL_PROJECTS_LIST:
        return Object.assign({}, state, {
            status: LocalProjectsStatus.IDLE,
            records: action.records,
            corruptIds: action.corruptIds,
            error: null,
            pendingRestoreId: null,
            pendingDeleteId: null
        });
    case SET_LOCAL_PROJECTS_BUSY:
        return Object.assign({}, state, {
            status: LocalProjectsStatus.BUSY,
            error: null
        });
    case SET_LOCAL_PROJECTS_ERROR:
        return Object.assign({}, state, {
            status: LocalProjectsStatus.ERROR,
            error: action.error,
            pendingRestoreId: null,
            pendingDeleteId: null
        });
    case SET_LOCAL_PROJECTS_IDLE:
        return Object.assign({}, state, {
            status: LocalProjectsStatus.IDLE,
            error: null,
            pendingRestoreId: null,
            pendingDeleteId: null
        });
    case REQUEST_RESTORE_LOCAL_PROJECT:
        return Object.assign({}, state, {
            pendingRestoreId: action.id
        });
    case REQUEST_DELETE_LOCAL_PROJECT:
        return Object.assign({}, state, {
            pendingDeleteId: action.id
        });
    default:
        return state;
    }
};

const updateLocalProjectsList = (records, corruptIds) => ({
    type: UPDATE_LOCAL_PROJECTS_LIST,
    records,
    corruptIds: corruptIds || []
});

const setLocalProjectsBusy = () => ({
    type: SET_LOCAL_PROJECTS_BUSY
});

const setLocalProjectsError = error => ({
    type: SET_LOCAL_PROJECTS_ERROR,
    error: error instanceof Error ? error.message : String(error)
});

const setLocalProjectsIdle = () => ({
    type: SET_LOCAL_PROJECTS_IDLE
});

const requestRestoreLocalProject = id => ({
    type: REQUEST_RESTORE_LOCAL_PROJECT,
    id
});

const requestDeleteLocalProject = id => ({
    type: REQUEST_DELETE_LOCAL_PROJECT,
    id
});

export {
    reducer as default,
    initialState as localProjectsInitialState,
    LocalProjectsStatus,
    updateLocalProjectsList,
    setLocalProjectsBusy,
    setLocalProjectsError,
    setLocalProjectsIdle,
    requestRestoreLocalProject,
    requestDeleteLocalProject
};
