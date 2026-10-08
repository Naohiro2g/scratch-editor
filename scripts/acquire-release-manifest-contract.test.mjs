import assert from 'node:assert/strict';
import {chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {test} from 'node:test';
import {acquireContract, validateContractLock} from './acquire-release-manifest-contract.mjs';
import {loadContract} from './release-manifest-contract.mjs';

const lockPath = resolve('mc-remote/release-manifest-lock.json');
const lock = JSON.parse(readFileSync(lockPath));
const source = resolve('mc-remote/release-manifest');
const setup = t => {
    const destination = mkdtempSync(join(tmpdir(), 'scratch-manifest-contract-'));
    t.after(() => rmSync(destination, {recursive: true, force: true}));
    return destination;
};

test('acquisition pins source, checks bytes, and uses verified cache offline', async t => {
    const destination = setup(t);
    const calls = [];
    await acquireContract({lock,
        destination,
        download: (origin, path) => {
            calls.push(path);
            assert.deepEqual(origin, lock.source);
            return readFileSync(join(source, path));
        }});
    assert.equal(calls.length, 6);
    await acquireContract({lock,
        destination,
        download: () => {
            throw new Error('must not download');
        }});
    const contract = await loadContract({lockPath, cacheDirectory: destination});
    assert.equal(typeof contract.validate, 'function');
});

test('acquisition and loading reject corrupted files instead of repairing silently', async t => {
    const destination = setup(t);
    const download = (origin, path) => readFileSync(join(source, path));
    await acquireContract({lock, destination, download});
    const path = join(destination, 'schemas/release-manifest-checks.mjs');
    chmodSync(path, 0o644);
    writeFileSync(path, 'throw new Error("unverified code must not run");');
    await assert.rejects(loadContract({lockPath, cacheDirectory: destination}), /identity mismatch/);
    await assert.rejects(acquireContract({lock, destination, download}), /identity mismatch/);
    await assert.rejects(acquireContract({
        lock, destination: setup(t), download: () => Buffer.from('wrong')
    }), /identity mismatch/);
});

test('contract lock rejects floating commits, duplicate files, and paths outside schemas', () => {
    assert.throws(() => validateContractLock({...lock, source: {...lock.source, commit: 'main'}}), /full commit/);
    const duplicate = structuredClone(lock);
    duplicate.files[1] = duplicate.files[0];
    assert.throws(() => validateContractLock(duplicate), /identity/);
    const traversal = structuredClone(lock);
    traversal.files[0].path = '../other';
    assert.throws(() => validateContractLock(traversal), /identity/);
});
