import reducer, {
    localProjectsInitialState,
    LocalProjectsStatus,
    updateLocalProjectsList,
    setLocalProjectsBusy,
    setLocalProjectsError,
    setLocalProjectsIdle,
    requestRestoreLocalProject,
    requestDeleteLocalProject
} from '../../../src/reducers/local-projects';

describe('local projects reducer', () => {
    test('starts idle with no saved projects', () => {
        let state;
        expect(reducer(state, {})).toEqual(localProjectsInitialState);
    });

    test('updateLocalProjectsList replaces records and corrupt ids, clearing any error', () => {
        const records = [{id: 'a', title: 'A', updatedAt: 1}];
        const corruptIds = ['broken'];
        const state = reducer({
            ...localProjectsInitialState,
            status: LocalProjectsStatus.ERROR,
            error: 'boom'
        }, updateLocalProjectsList(records, corruptIds));

        expect(state).toEqual({
            status: LocalProjectsStatus.IDLE,
            records,
            corruptIds,
            error: null,
            pendingRestoreId: null,
            pendingDeleteId: null
        });
    });

    test('updateLocalProjectsList defaults corruptIds to an empty array', () => {
        let previousState;
        const state = reducer(previousState, updateLocalProjectsList([]));
        expect(state.corruptIds).toEqual([]);
    });

    test('setLocalProjectsBusy marks busy and clears any prior error', () => {
        const state = reducer({
            ...localProjectsInitialState,
            status: LocalProjectsStatus.ERROR,
            error: 'boom'
        }, setLocalProjectsBusy());

        expect(state.status).toBe(LocalProjectsStatus.BUSY);
        expect(state.error).toBeNull();
    });

    test('setLocalProjectsError records an Error message', () => {
        let previousState;
        const state = reducer(previousState, setLocalProjectsError(new Error('quota exceeded')));
        expect(state.status).toBe(LocalProjectsStatus.ERROR);
        expect(state.error).toBe('quota exceeded');
    });

    test('setLocalProjectsError stringifies a non-Error value', () => {
        let previousState;
        const state = reducer(previousState, setLocalProjectsError('plain string error'));
        expect(state.error).toBe('plain string error');
    });

    test('setLocalProjectsIdle clears busy/error without touching records', () => {
        const busyState = {
            status: LocalProjectsStatus.ERROR,
            records: [{id: 'a', title: 'A', updatedAt: 1}],
            corruptIds: [],
            error: 'boom'
        };
        const state = reducer(busyState, setLocalProjectsIdle());

        expect(state.status).toBe(LocalProjectsStatus.IDLE);
        expect(state.error).toBeNull();
        expect(state.records).toBe(busyState.records);
    });

    test('requestRestoreLocalProject records which id was requested', () => {
        let previousState;
        const state = reducer(previousState, requestRestoreLocalProject('project-1'));
        expect(state.pendingRestoreId).toBe('project-1');
        expect(state.pendingDeleteId).toBeNull();
    });

    test('requestDeleteLocalProject records which id was requested', () => {
        let previousState;
        const state = reducer(previousState, requestDeleteLocalProject('project-1'));
        expect(state.pendingDeleteId).toBe('project-1');
        expect(state.pendingRestoreId).toBeNull();
    });

    test('terminal actions (list update, error, idle) clear any pending request', () => {
        const withPending = {
            ...localProjectsInitialState,
            pendingRestoreId: 'project-1'
        };
        expect(reducer(withPending, updateLocalProjectsList([])).pendingRestoreId).toBeNull();
        expect(reducer(withPending, setLocalProjectsError('boom')).pendingRestoreId).toBeNull();
        expect(reducer(withPending, setLocalProjectsIdle()).pendingRestoreId).toBeNull();
    });
});
