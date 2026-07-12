import {
    detectMcRemoteConnectionTargetRoute,
    persistMcRemoteConnectionTargetRoute
} from '../../../src/lib/mcremote-connection-target-persistence';

const STORAGE_KEY = 'mcremote.connectionTarget.v1';

describe('McRemote connection target persistence', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('returns the default route when localStorage is empty', () => {
        expect(detectMcRemoteConnectionTargetRoute()).toEqual('sb.mc-remote.com');
    });

    test('persists a known sandbox route', () => {
        persistMcRemoteConnectionTargetRoute('sb-dev.mc-remote.com');

        expect(window.localStorage.getItem(STORAGE_KEY)).toEqual('sb-dev.mc-remote.com');
        expect(detectMcRemoteConnectionTargetRoute()).toEqual('sb-dev.mc-remote.com');
    });

    test('falls back to the default route for an unknown stored route', () => {
        window.localStorage.setItem(STORAGE_KEY, 'unknown.mc-remote.example');

        expect(detectMcRemoteConnectionTargetRoute()).toEqual('sb.mc-remote.com');
    });
});
