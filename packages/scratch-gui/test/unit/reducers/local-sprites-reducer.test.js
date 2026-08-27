import reducer, {
    localSpritesInitialState,
    LocalSpritesStatus,
    updateLocalSpritesList,
    setLocalSpritesBusy,
    setLocalSpritesError,
    setLocalSpritesIdle,
    requestSaveLocalSprite,
    requestRestoreLocalSprite,
    requestDeleteLocalSprite
} from '../../../src/reducers/local-sprites';

describe('local sprites reducer', () => {
    test('starts idle with no saved sprites', () => {
        let state;
        expect(reducer(state, {})).toEqual(localSpritesInitialState);
    });

    test('updateLocalSpritesList replaces records and corrupt ids, clearing any error', () => {
        const records = [{id: 'a', name: 'A', updatedAt: 1}];
        const corruptIds = ['broken'];
        const state = reducer({
            ...localSpritesInitialState,
            status: LocalSpritesStatus.ERROR,
            error: 'boom'
        }, updateLocalSpritesList(records, corruptIds));

        expect(state).toEqual({
            status: LocalSpritesStatus.IDLE,
            records,
            corruptIds,
            error: null,
            pendingSaveTargetId: null,
            pendingRestoreId: null,
            pendingDeleteId: null
        });
    });

    test('updateLocalSpritesList defaults corruptIds to an empty array', () => {
        let previousState;
        const state = reducer(previousState, updateLocalSpritesList([]));
        expect(state.corruptIds).toEqual([]);
    });

    test('setLocalSpritesBusy marks busy and clears any prior error', () => {
        const state = reducer({
            ...localSpritesInitialState,
            status: LocalSpritesStatus.ERROR,
            error: 'boom'
        }, setLocalSpritesBusy());

        expect(state.status).toBe(LocalSpritesStatus.BUSY);
        expect(state.error).toBeNull();
    });

    test('setLocalSpritesError records an Error message', () => {
        let previousState;
        const state = reducer(previousState, setLocalSpritesError(new Error('quota exceeded')));
        expect(state.status).toBe(LocalSpritesStatus.ERROR);
        expect(state.error).toBe('quota exceeded');
    });

    test('setLocalSpritesIdle clears busy/error without touching records', () => {
        const busyState = {
            status: LocalSpritesStatus.ERROR,
            records: [{id: 'a', name: 'A', updatedAt: 1}],
            corruptIds: [],
            error: 'boom',
            pendingSaveTargetId: null,
            pendingRestoreId: null,
            pendingDeleteId: null
        };
        const state = reducer(busyState, setLocalSpritesIdle());

        expect(state.status).toBe(LocalSpritesStatus.IDLE);
        expect(state.error).toBeNull();
        expect(state.records).toBe(busyState.records);
    });

    test('requestSaveLocalSprite records which VM target id was requested', () => {
        let previousState;
        const state = reducer(previousState, requestSaveLocalSprite('target-1'));
        expect(state.pendingSaveTargetId).toBe('target-1');
    });

    test('requestRestoreLocalSprite records which record id was requested', () => {
        let previousState;
        const state = reducer(previousState, requestRestoreLocalSprite('sprite-1'));
        expect(state.pendingRestoreId).toBe('sprite-1');
    });

    test('requestDeleteLocalSprite records which record id was requested', () => {
        let previousState;
        const state = reducer(previousState, requestDeleteLocalSprite('sprite-1'));
        expect(state.pendingDeleteId).toBe('sprite-1');
    });

    test('terminal actions (list update, error, idle) clear any pending request', () => {
        const withPending = {
            ...localSpritesInitialState,
            pendingSaveTargetId: 'target-1',
            pendingRestoreId: 'sprite-1'
        };
        expect(reducer(withPending, updateLocalSpritesList([])).pendingSaveTargetId).toBeNull();
        expect(reducer(withPending, setLocalSpritesError('boom')).pendingRestoreId).toBeNull();
        expect(reducer(withPending, setLocalSpritesIdle()).pendingRestoreId).toBeNull();
    });
});
