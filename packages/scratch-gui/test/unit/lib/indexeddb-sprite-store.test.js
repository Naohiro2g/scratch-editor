/**
 * @jest-environment node
 *
 * fake-indexeddb needs a real `structuredClone` global, which jsdom's test
 * environment doesn't provide; Node's own environment has it (and `Blob`)
 * built in, and this module doesn't touch the DOM.
 */
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import IndexedDBSpriteStore from '../../../src/lib/indexeddb-sprite-store';
import IndexedDBProjectStore from '../../../src/lib/indexeddb-project-store';

const makeStore = () => new IndexedDBSpriteStore(new FDBFactory());

const makeRecord = (overrides = {}) => ({
    id: 'sprite-1',
    name: 'My Sprite',
    updatedAt: Date.now(),
    sprite3: new Blob(['fake sprite3 bytes'], {type: 'application/x.scratch.sprite3'}),
    thumbnail: null,
    ...overrides
});

describe('IndexedDBSpriteStore', () => {
    test('reports availability based on the injected database factory', () => {
        expect(makeStore().isAvailable()).toBe(true);
        expect(new IndexedDBSpriteStore(null).isAvailable()).toBe(false);
    });

    test('list() on an empty store returns no records', async () => {
        const store = makeStore();
        await expect(store.list()).resolves.toEqual({records: [], corruptIds: []});
    });

    test('put() then get() round-trips a record', async () => {
        const store = makeStore();
        const record = makeRecord();
        await store.put(record);

        const fetched = await store.get('sprite-1');
        expect(fetched.id).toBe('sprite-1');
        expect(fetched.name).toBe('My Sprite');
        expect(fetched.sprite3).toBeInstanceOf(Blob);
        expect(fetched.sprite3.size).toBe(record.sprite3.size);
    });

    test('put() overwrites an existing record with the same id', async () => {
        const store = makeStore();
        await store.put(makeRecord({name: 'First'}));
        await store.put(makeRecord({name: 'Second'}));

        const {records} = await store.list();
        expect(records).toHaveLength(1);
        expect(records[0].name).toBe('Second');
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
        await store.remove('sprite-1');

        await expect(store.get('sprite-1')).resolves.toBeNull();
    });

    test('remove() on a missing id does not throw', async () => {
        const store = makeStore();
        await expect(store.remove('does-not-exist')).resolves.toBeUndefined();
    });

    test('get() on a missing id resolves to null', async () => {
        const store = makeStore();
        await expect(store.get('does-not-exist')).resolves.toBeNull();
    });

    test('put() rejects a record with no sprite3 payload, leaving prior data untouched', async () => {
        const store = makeStore();
        await store.put(makeRecord({name: 'Good save'}));

        await expect(store.put(makeRecord({name: 'Bad save', sprite3: null})))
            .rejects.toThrow();

        const fetched = await store.get('sprite-1');
        expect(fetched.name).toBe('Good save');
    });

    test('list() separates corrupt records from valid ones instead of dropping them', async () => {
        const factory = new FDBFactory();
        const store = new IndexedDBSpriteStore(factory);
        await store.put(makeRecord({id: 'valid'}));

        await new Promise((resolve, reject) => {
            const request = factory.open('scratch-gui-local-projects', 2);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction('sprites', 'readwrite');
                tx.objectStore('sprites').put({id: 'corrupt', updatedAt: 1});
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
        const store = new IndexedDBSpriteStore(null);
        await expect(store.list()).resolves.toEqual({records: [], corruptIds: []});
        await expect(store.get('anything')).resolves.toBeNull();
        await expect(store.put(makeRecord())).rejects.toThrow();
    });

    test('shares one database with IndexedDBProjectStore, keeping project and sprite records apart', async () => {
        const factory = new FDBFactory();
        const projectStore = new IndexedDBProjectStore(factory);
        const spriteStore = new IndexedDBSpriteStore(factory);

        await projectStore.put({
            id: 'shared-id',
            title: 'A project',
            updatedAt: Date.now(),
            sb3: new Blob(['project bytes']),
            thumbnail: null
        });
        await spriteStore.put(makeRecord({id: 'shared-id'}));

        const {records: projectRecords} = await projectStore.list();
        const {records: spriteRecords} = await spriteStore.list();
        expect(projectRecords).toHaveLength(1);
        expect(spriteRecords).toHaveLength(1);
        expect(projectRecords[0].title).toBe('A project');
        expect(spriteRecords[0].name).toBe('My Sprite');
    });
});
