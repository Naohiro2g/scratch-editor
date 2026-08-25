/**
 * @jest-environment node
 *
 * fake-indexeddb needs a real `structuredClone` global, which jsdom's test
 * environment doesn't provide; Node's own environment has it (and `Blob`)
 * built in, and this module doesn't touch the DOM.
 */
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import IndexedDBProjectStore from '../../../src/lib/indexeddb-project-store';

const makeStore = () => new IndexedDBProjectStore(new FDBFactory());

const makeRecord = (overrides = {}) => ({
    id: 'project-1',
    title: 'My Project',
    updatedAt: Date.now(),
    sb3: new Blob(['fake sb3 bytes'], {type: 'application/x.scratch.sb3'}),
    thumbnail: null,
    ...overrides
});

describe('IndexedDBProjectStore', () => {
    test('reports availability based on the injected database factory', () => {
        expect(makeStore().isAvailable()).toBe(true);
        expect(new IndexedDBProjectStore(null).isAvailable()).toBe(false);
    });

    test('list() on an empty store returns no records', async () => {
        const store = makeStore();
        await expect(store.list()).resolves.toEqual({records: [], corruptIds: []});
    });

    test('put() then get() round-trips a record', async () => {
        const store = makeStore();
        const record = makeRecord();
        await store.put(record);

        const fetched = await store.get('project-1');
        expect(fetched.id).toBe('project-1');
        expect(fetched.title).toBe('My Project');
        expect(fetched.sb3).toBeInstanceOf(Blob);
        expect(fetched.sb3.size).toBe(record.sb3.size);
    });

    test('put() overwrites an existing record with the same id', async () => {
        const store = makeStore();
        await store.put(makeRecord({title: 'First'}));
        await store.put(makeRecord({title: 'Second'}));

        const {records} = await store.list();
        expect(records).toHaveLength(1);
        expect(records[0].title).toBe('Second');
    });

    test('list() sorts by updatedAt, most recent first', async () => {
        const store = makeStore();
        await store.put(makeRecord({id: 'older', updatedAt: 1000}));
        await store.put(makeRecord({id: 'newer', updatedAt: 2000}));

        const {records} = await store.list();
        expect(records.map(r => r.id)).toEqual(['newer', 'older']);
    });

    test('remove() deletes a record', async () => {
        const store = makeStore();
        await store.put(makeRecord());
        await store.remove('project-1');

        await expect(store.get('project-1')).resolves.toBeNull();
    });

    test('remove() on a missing id does not throw', async () => {
        const store = makeStore();
        await expect(store.remove('does-not-exist')).resolves.toBeUndefined();
    });

    test('get() on a missing id resolves to null', async () => {
        const store = makeStore();
        await expect(store.get('does-not-exist')).resolves.toBeNull();
    });

    test('put() rejects a record with no sb3 payload, leaving prior data untouched', async () => {
        const store = makeStore();
        await store.put(makeRecord({title: 'Good save'}));

        await expect(store.put(makeRecord({title: 'Bad save', sb3: null})))
            .rejects.toThrow();

        const fetched = await store.get('project-1');
        expect(fetched.title).toBe('Good save');
    });

    test('list() separates corrupt records from valid ones instead of dropping them', async () => {
        const factory = new FDBFactory();
        const store = new IndexedDBProjectStore(factory);
        await store.put(makeRecord({id: 'valid'}));

        // Write a shape that isValidRecord() rejects directly through the
        // same factory, simulating on-disk corruption the store didn't cause.
        await new Promise((resolve, reject) => {
            const request = factory.open('scratch-gui-local-projects', 2);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction('projects', 'readwrite');
                tx.objectStore('projects').put({id: 'corrupt', updatedAt: 1});
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            };
            request.onerror = () => reject(request.error);
        });

        const {records, corruptIds} = await store.list();
        expect(records.map(r => r.id)).toEqual(['valid']);
        expect(corruptIds).toEqual(['corrupt']);
    });

    test('a store with no database factory behaves as empty rather than throwing', async () => {
        const store = new IndexedDBProjectStore(null);
        await expect(store.list()).resolves.toEqual({records: [], corruptIds: []});
        await expect(store.get('anything')).resolves.toBeNull();
        await expect(store.put(makeRecord())).rejects.toThrow();
    });
});
