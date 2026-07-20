import reducer, {
    mcremoteConnectionTargetInitialState,
    setMcRemoteConnectionTarget
} from '../../../src/reducers/mcremote-connection-target';

test('initialState', () => {
    let defaultState;
    expect(reducer(defaultState, {type: 'anything'})).toEqual(mcremoteConnectionTargetInitialState);
});

test('setMcRemoteConnectionTarget stores the configured sandbox route', () => {
    let defaultState;
    expect(reducer(defaultState, setMcRemoteConnectionTarget('sb.mc-remote.com'))).toEqual({
        sandboxRoute: 'sb.mc-remote.com'
    });
});

test('setMcRemoteConnectionTarget falls back to the default route for removed sb-dev input', () => {
    let defaultState;
    expect(reducer(defaultState, setMcRemoteConnectionTarget('sb-dev.mc-remote.com'))).toEqual({
        sandboxRoute: 'sb.mc-remote.com'
    });
});
