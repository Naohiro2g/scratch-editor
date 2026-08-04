const UPDATE = 'scratch-gui/mcremote-catalog/UPDATE';

const initialState = {
    status: 'not_acquired',
    mcVersion: '',
    catalogHash: null,
    source: null,
    fetchedAt: null,
    catalog: null
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

const updateMcRemoteCatalog = function (snapshot) {
    return {
        type: UPDATE,
        snapshot
    };
};

export {
    reducer as default,
    initialState as mcremoteCatalogInitialState,
    updateMcRemoteCatalog
};
