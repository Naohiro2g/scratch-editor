import reducer, {
    mcremoteConnectionTargetInitialState,
    setMcRemoteConnectionTarget
} from '../../../src/reducers/mcremote-connection-target';

test('initialState', () => {
    let defaultState;
    expect(reducer(defaultState, {type: 'anything'})).toEqual(mcremoteConnectionTargetInitialState);
});

test('setMcRemoteConnectionTarget keeps the bundled disabled runtime without a route', () => {
    let defaultState;
    expect(reducer(defaultState, setMcRemoteConnectionTarget('sb.mc-remote.com'))).toEqual({
        sandboxRoute: null
    });
});

test('setMcRemoteConnectionTarget does not revive a removed route while disabled', () => {
    let defaultState;
    expect(reducer(defaultState, setMcRemoteConnectionTarget('sb-dev.mc-remote.com'))).toEqual({
        sandboxRoute: null
    });
});
