import reducer, {
    mcremoteObservationInitialState,
    updateMcRemoteObservation
} from '../../../src/reducers/mcremote-observation';

test('initialState', () => {
    let defaultState;
    expect(reducer(defaultState, {type: 'anything'})).toEqual(mcremoteObservationInitialState);
});

test('updateMcRemoteObservation stores a full observer snapshot', () => {
    let defaultState;
    const snapshot = {
        status: 'connected',
        streamId: 'default',
        sourceKind: 'scratch',
        displayAlias: 'MOSS-ORBIT-27',
        connectionTarget: {
            sandboxRoute: 'sb-dev.mc-remote.com',
            label: 'Development Sandbox'
        },
        pairCode: '827-419',
        pairCommand: '/mcremote pair 827-419',
        hello: {
            protocol: '21.0.0',
            mc_version: '26.1.2',
            world_constants: {y_sea: 63},
            permissions: {build: true}
        },
        lastError: null,
        lastOperationError: {method: 'world.setBlock', reason: 'out_of_bounds'},
        frameLog: [{sequence: 1, method: 'hello'}]
    };

    expect(reducer(defaultState, updateMcRemoteObservation(snapshot))).toEqual(snapshot);
});

test('updateMcRemoteObservation falls back to initial values for missing fields', () => {
    const previousState = {
        ...mcremoteObservationInitialState,
        status: 'connected',
        lastOperationError: {method: 'world.setBlock', reason: 'out_of_bounds'}
    };
    expect(reducer(previousState, updateMcRemoteObservation({
        status: 'pairing',
        pairCode: '827-419'
    }))).toEqual({
        ...mcremoteObservationInitialState,
        status: 'pairing',
        pairCode: '827-419'
    });
});
