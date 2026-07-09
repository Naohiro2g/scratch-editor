import {defineMessages} from 'react-intl';

const DEFAULT_MCREMOTE_CONNECTION_TARGET_ROUTE = 'sb.mc-remote.com';

const connectionTargetLabels = defineMessages({
    sandbox: {
        id: 'gui.mcremote.connectionTarget.sandbox',
        defaultMessage: 'Sandbox',
        description: 'Menu label for the default McRemote Sandbox server'
    },
    sandboxDev: {
        id: 'gui.mcremote.connectionTarget.sandboxDev',
        defaultMessage: 'Development Sandbox',
        description: 'Menu label for the development McRemote Sandbox server'
    },
    kitako23: {
        id: 'gui.mcremote.connectionTarget.kitako23',
        defaultMessage: 'Kitako 2-3',
        description: 'Menu label for a local classroom McRemote Sandbox server'
    }
});

const MCREMOTE_CONNECTION_TARGETS = [
    {
        id: 'sandbox',
        sandboxRoute: DEFAULT_MCREMOTE_CONNECTION_TARGET_ROUTE,
        label: connectionTargetLabels.sandbox
    },
    {
        id: 'sandboxDev',
        sandboxRoute: 'sb-dev.mc-remote.com',
        label: connectionTargetLabels.sandboxDev
    },
    {
        id: 'kitako23',
        sandboxRoute: '127.0.0.1',
        label: connectionTargetLabels.kitako23
    }
];

const normalizeMcRemoteConnectionTargetRoute = function (route) {
    return typeof route === 'string' ? route.trim() : '';
};

const getMcRemoteConnectionTargetByRoute = function (route) {
    const sandboxRoute = normalizeMcRemoteConnectionTargetRoute(route);
    // eslint-disable-next-line arrow-parens
    return MCREMOTE_CONNECTION_TARGETS.find(target => target.sandboxRoute === sandboxRoute) ||
        MCREMOTE_CONNECTION_TARGETS[0];
};

export {
    DEFAULT_MCREMOTE_CONNECTION_TARGET_ROUTE,
    MCREMOTE_CONNECTION_TARGETS,
    getMcRemoteConnectionTargetByRoute,
    normalizeMcRemoteConnectionTargetRoute
};
