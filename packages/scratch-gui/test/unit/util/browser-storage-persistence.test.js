jest.mock('../../../src/lib/mcremote-runtime-config.js', () => ({
    getMcRemoteRuntimeConfig: jest.fn()
}));

const {getMcRemoteRuntimeConfig} = require('../../../src/lib/mcremote-runtime-config.js');
const {
    checkBrowserStoragePersisted,
    requestBrowserStoragePersistence
} = require('../../../src/lib/browser-storage-persistence.js');

describe('browser storage persistence', () => {
    const originalStorage = navigator.storage;

    afterEach(() => {
        getMcRemoteRuntimeConfig.mockReset();
        Object.defineProperty(navigator, 'storage', {value: originalStorage, configurable: true});
    });

    describe('requestBrowserStoragePersistence', () => {
        test('does not call navigator.storage.persist() when the deployment has not opted in', async () => {
            getMcRemoteRuntimeConfig.mockReturnValue({storagePersistEnabled: false});
            const persist = jest.fn().mockResolvedValue(true);
            Object.defineProperty(navigator, 'storage', {value: {persist}, configurable: true});
            await expect(requestBrowserStoragePersistence()).resolves.toBeNull();
            expect(persist).not.toHaveBeenCalled();
        });

        test('calls navigator.storage.persist() and returns its result when opted in', async () => {
            getMcRemoteRuntimeConfig.mockReturnValue({storagePersistEnabled: true});
            const persist = jest.fn().mockResolvedValue(true);
            Object.defineProperty(navigator, 'storage', {value: {persist}, configurable: true});
            await expect(requestBrowserStoragePersistence()).resolves.toBe(true);
            expect(persist).toHaveBeenCalled();
        });

        test('resolves null when the Storage API is unsupported', async () => {
            getMcRemoteRuntimeConfig.mockReturnValue({storagePersistEnabled: true});
            delete navigator.storage;
            await expect(requestBrowserStoragePersistence()).resolves.toBeNull();
        });

        test('resolves null and logs a warning when persist() rejects', async () => {
            getMcRemoteRuntimeConfig.mockReturnValue({storagePersistEnabled: true});
            const persist = jest.fn().mockRejectedValue(new Error('denied'));
            Object.defineProperty(navigator, 'storage', {value: {persist}, configurable: true});
            const log = require('../../../src/lib/log.js').default;
            const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
            await expect(requestBrowserStoragePersistence()).resolves.toBeNull();
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('denied'));
            warn.mockRestore();
        });
    });

    describe('checkBrowserStoragePersisted', () => {
        test('returns the browser-reported persisted status', async () => {
            const persisted = jest.fn().mockResolvedValue(true);
            Object.defineProperty(navigator, 'storage', {value: {persisted}, configurable: true});
            await expect(checkBrowserStoragePersisted()).resolves.toBe(true);
        });

        test('resolves null when the Storage API is unsupported', async () => {
            delete navigator.storage;
            await expect(checkBrowserStoragePersisted()).resolves.toBeNull();
        });

        test('resolves null and logs a warning when persisted() rejects', async () => {
            const persisted = jest.fn().mockRejectedValue(new Error('boom'));
            Object.defineProperty(navigator, 'storage', {value: {persisted}, configurable: true});
            const log = require('../../../src/lib/log.js').default;
            const warn = jest.spyOn(log, 'warn').mockImplementation(() => {});
            await expect(checkBrowserStoragePersisted()).resolves.toBeNull();
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
            warn.mockRestore();
        });
    });
});
