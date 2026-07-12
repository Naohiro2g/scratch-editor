import reducer, {
    mcremoteConnectionTargetInitialState,
    setMcRemoteConnectionTarget
} from '../../../src/reducers/mcremote-connection-target';

test('initialState', () => {
    let defaultState;
    expect(reducer(defaultState, {type: 'anything'})).toEqual(mcremoteConnectionTargetInitialState);
});

test('setMcRemoteConnectionTarget stores a known sandbox route', () => {
    let defaultState;
    expect(reducer(defaultState, setMcRemoteConnectionTarget('sb-dev.mc-remote.com'))).toEqual({
        sandboxRoute: 'sb-dev.mc-remote.com'
    });
});

test('setMcRemoteConnectionTarget falls back to the default route for unknown input', () => {
    let defaultState;
    expect(reducer(defaultState, setMcRemoteConnectionTarget('unknown.mc-remote.example'))).toEqual({
        sandboxRoute: 'sb.mc-remote.com'
    });
});
