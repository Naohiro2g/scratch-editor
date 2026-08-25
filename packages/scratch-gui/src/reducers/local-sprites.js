/**
 * Redux state for the browser-saved-sprite list (b6 slice, reusing the save
 * -track entry gate's IndexedDB foundation). Only record metadata (id, name,
 * updatedAt, thumbnail) lives here; the `.sprite3` payload stays in
 * IndexedDB — see `indexeddb-sprite-store.js`.
 *
 * Save/restore/delete all follow this codebase's existing menu-action
 * pattern (see `local-projects.js`): a context-menu click or File-menu click
 * dispatches a plain "this was requested" action, and
 * `local-sprite-saver-hoc.jsx` reacts to the resulting state change to do
 * the actual (async, IndexedDB-backed) work.
 */
const UPDATE_LOCAL_SPRITES_LIST = 'scratch-gui/local-sprites/UPDATE_LOCAL_SPRITES_LIST';
const SET_LOCAL_SPRITES_BUSY = 'scratch-gui/local-sprites/SET_LOCAL_SPRITES_BUSY';
const SET_LOCAL_SPRITES_ERROR = 'scratch-gui/local-sprites/SET_LOCAL_SPRITES_ERROR';
const SET_LOCAL_SPRITES_IDLE = 'scratch-gui/local-sprites/SET_LOCAL_SPRITES_IDLE';
const REQUEST_SAVE_LOCAL_SPRITE = 'scratch-gui/local-sprites/REQUEST_SAVE_LOCAL_SPRITE';
const REQUEST_RESTORE_LOCAL_SPRITE = 'scratch-gui/local-sprites/REQUEST_RESTORE_LOCAL_SPRITE';
const REQUEST_DELETE_LOCAL_SPRITE = 'scratch-gui/local-sprites/REQUEST_DELETE_LOCAL_SPRITE';

const LocalSpritesStatus = {
    IDLE: 'idle',
    BUSY: 'busy',
    ERROR: 'error'
};

const initialState = {
    status: LocalSpritesStatus.IDLE,
    records: [],
    corruptIds: [],
    error: null,
    pendingSaveTargetId: null,
    pendingRestoreId: null,
    pendingDeleteId: null
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case UPDATE_LOCAL_SPRITES_LIST:
        return Object.assign({}, state, {
            status: LocalSpritesStatus.IDLE,
            records: action.records,
            corruptIds: action.corruptIds,
            error: null,
            pendingSaveTargetId: null,
            pendingRestoreId: null,
            pendingDeleteId: null
        });
    case SET_LOCAL_SPRITES_BUSY:
        return Object.assign({}, state, {
            status: LocalSpritesStatus.BUSY,
            error: null
        });
    case SET_LOCAL_SPRITES_ERROR:
        return Object.assign({}, state, {
            status: LocalSpritesStatus.ERROR,
            error: action.error,
            pendingSaveTargetId: null,
            pendingRestoreId: null,
            pendingDeleteId: null
        });
    case SET_LOCAL_SPRITES_IDLE:
        return Object.assign({}, state, {
            status: LocalSpritesStatus.IDLE,
            error: null,
            pendingSaveTargetId: null,
            pendingRestoreId: null,
            pendingDeleteId: null
        });
    case REQUEST_SAVE_LOCAL_SPRITE:
        return Object.assign({}, state, {
            pendingSaveTargetId: action.targetId
        });
    case REQUEST_RESTORE_LOCAL_SPRITE:
        return Object.assign({}, state, {
            pendingRestoreId: action.id
        });
    case REQUEST_DELETE_LOCAL_SPRITE:
        return Object.assign({}, state, {
            pendingDeleteId: action.id
        });
    default:
        return state;
    }
};

const updateLocalSpritesList = (records, corruptIds) => ({
    type: UPDATE_LOCAL_SPRITES_LIST,
    records,
    corruptIds: corruptIds || []
});

const setLocalSpritesBusy = () => ({
    type: SET_LOCAL_SPRITES_BUSY
});

const setLocalSpritesError = error => ({
    type: SET_LOCAL_SPRITES_ERROR,
    error: error instanceof Error ? error.message : String(error)
});

const setLocalSpritesIdle = () => ({
    type: SET_LOCAL_SPRITES_IDLE
});

const requestSaveLocalSprite = targetId => ({
    type: REQUEST_SAVE_LOCAL_SPRITE,
    targetId
});

const requestRestoreLocalSprite = id => ({
    type: REQUEST_RESTORE_LOCAL_SPRITE,
    id
});

const requestDeleteLocalSprite = id => ({
    type: REQUEST_DELETE_LOCAL_SPRITE,
    id
});

export {
    reducer as default,
    initialState as localSpritesInitialState,
    LocalSpritesStatus,
    updateLocalSpritesList,
    setLocalSpritesBusy,
    setLocalSpritesError,
    setLocalSpritesIdle,
    requestSaveLocalSprite,
    requestRestoreLocalSprite,
    requestDeleteLocalSprite
};
