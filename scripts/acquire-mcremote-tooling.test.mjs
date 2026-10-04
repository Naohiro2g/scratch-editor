import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateLock, verifyBytes} from './acquire-mcremote-tooling.mjs';

const bytes = Buffer.from('fixture\n');
const record = {path: 'packages/protocol/test/fixtures/events-v23.json', bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')};
const lock = () => ({schema: 'mcremote.tooling-lock', schema_version: 1,
    source: {repository: 'Naohiro2g/minecraft-remote-tooling', commit: 'a'.repeat(40)}, fixtures: [record]});

test('fixed source and fixture bytes are accepted', () => {
    assert.equal(validateLock(lock()).fixtures.length, 1);
    assert.equal(verifyBytes(record, bytes), bytes);
});

test('corrupted same-length data and truncated data fail closed', () => {
    assert.throws(() => verifyBytes(record, Buffer.from('Fixture\n')), /identity mismatch/);
    assert.throws(() => verifyBytes(record, bytes.subarray(1)), /identity mismatch/);
});

test('floating source refs, wrong owners and path traversal are rejected', () => {
    const floating = lock();
    floating.source.commit = 'main';
    assert.throws(() => validateLock(floating), /full source commit/);
    const other = lock();
    other.source.repository = 'Naohiro2g/scratch-editor';
    assert.throws(() => validateLock(other), /approved repository/);
    const traversal = lock();
    traversal.fixtures = [{...record, path: 'packages/protocol/test/fixtures/../../secret.json'}];
    assert.throws(() => validateLock(traversal), /fixture path/);
});

test('duplicate fixture paths and invalid file digests are rejected', () => {
    const duplicate = lock();
    duplicate.fixtures.push(record);
    assert.throws(() => validateLock(duplicate), /duplicate/);
    const invalid = lock();
    invalid.fixtures = [{...record, sha256: 'not-a-digest'}];
    assert.throws(() => validateLock(invalid), /identity/);
});
