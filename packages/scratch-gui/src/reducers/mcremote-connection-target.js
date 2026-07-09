import {detectMcRemoteConnectionTargetRoute} from '../lib/mcremote-connection-target-persistence.js';
import {getMcRemoteConnectionTargetByRoute} from '../lib/mcremote-connection-targets.js';

const SET = 'scratch-gui/mcremote-connection-target/SET';

const initialState = {
    sandboxRoute: detectMcRemoteConnectionTargetRoute()
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case SET:
        return {
            sandboxRoute: getMcRemoteConnectionTargetByRoute(action.sandboxRoute).sandboxRoute
        };
    default:
        return state;
    }
};

const setMcRemoteConnectionTarget = function (sandboxRoute) {
    return {
        type: SET,
        sandboxRoute: sandboxRoute
    };
};

export {
    reducer as default,
    initialState as mcremoteConnectionTargetInitialState,
    setMcRemoteConnectionTarget
};
