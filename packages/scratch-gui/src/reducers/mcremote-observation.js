const UPDATE = 'scratch-gui/mcremote-observation/UPDATE';

const initialState = {
    status: 'disconnected',
    streamId: 'default',
    pairCode: '',
    pairCommand: '',
    hello: null,
    lastError: null,
    frameLog: []
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case UPDATE:
        return Object.assign({}, initialState, action.snapshot);
    default:
        return state;
    }
};

const updateMcRemoteObservation = function (snapshot) {
    return {
        type: UPDATE,
        snapshot: snapshot
    };
};

export {
    reducer as default,
    initialState as mcremoteObservationInitialState,
    updateMcRemoteObservation
};
