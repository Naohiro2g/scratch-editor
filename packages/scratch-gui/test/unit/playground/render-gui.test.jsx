import {getMcRemoteRuntimeConfig} from '../../../src/lib/mcremote-runtime-config.js';
import {handleVmInit} from '../../../src/playground/render-gui.jsx';

jest.mock('../../../src/containers/gui.jsx', () => ({
    __esModule: true,
    default: {setAppElement: jest.fn()}
}));
jest.mock('../../../src/lib/app-state-hoc.jsx', () => ({
    __esModule: true,
    default: function (Component) {
        return Component;
    }
}));
jest.mock('../../../src/lib/hash-parser-hoc.jsx', () => ({
    __esModule: true,
    default: function (Component) {
        return Component;
    }
}));
jest.mock('../../../src/lib/mcremote-runtime-config.js', () => ({
    getMcRemoteRuntimeConfig: () => ({
        defaultSandbox: 'sb.mc-remote.com',
        connectionTargets: [
            {id: 'stable', label: 'Stable', sandboxRoute: 'sb.mc-remote.com'},
            {id: 'dev', label: 'Development', sandboxRoute: 'sb-dev.mc-remote.com'}
        ]
    })
}));
jest.mock('../../../src/lib/mcremote-connection-target-persistence.js', () => ({
    detectMcRemoteConnectionTargetRoute: () => 'sb-dev.mc-remote.com'
}));
jest.mock('../../../src/lib/mcremote-connection-targets.js', () => ({
    getMcRemoteConnectionTargetByRoute: function (sandboxRoute) {
        return {
            sandboxRoute,
            label: sandboxRoute === 'sb-dev.mc-remote.com' ? 'Development' : 'Stable'
        };
    }
}));

describe('GUI playground McRemote initialization', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('sets the configured connection target before the GUI can start a connection', () => {
        const config = getMcRemoteRuntimeConfig();
        const target = config.connectionTargets.find(({sandboxRoute}) => sandboxRoute === 'sb-dev.mc-remote.com');
        const vm = {
            disableMcRemoteConnection: jest.fn(),
            setMcRemoteConnectionTarget: jest.fn(),
            setMcRemoteRuntimeConfig: jest.fn()
        };

        handleVmInit(vm);

        expect(vm.setMcRemoteConnectionTarget).toHaveBeenCalledWith({
            sandboxRoute: target.sandboxRoute,
            label: target.label
        });
        expect(vm.setMcRemoteRuntimeConfig.mock.invocationCallOrder[0]).toBeLessThan(
            vm.setMcRemoteConnectionTarget.mock.invocationCallOrder[0]
        );
    });
});
