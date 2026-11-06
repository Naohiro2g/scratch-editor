import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {validateLock, verifyBytes} from './acquire-mcremote-tooling.mjs';

const bytes = Buffer.from('fixture\n');
const record = {
    path: 'packages/protocol/test/fixtures/events-v23.json',
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes)
        .digest('hex')
};
const lock = () => ({
    schema: 'mcremote.tooling-lock',
    schema_version: 1,
    source: {repository: 'Naohiro2g/minecraft-remote-tooling', commit: 'a'.repeat(40)},
    fixture_source: {repository: 'Naohiro2g/minecraft-remote-tooling', commit: 'b'.repeat(40)},
    fixtures: [record]
});

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

test('fixture source requires an exact commit from the approved owner', () => {
    const floating = lock();
    floating.fixture_source.commit = 'main';
    assert.throws(() => validateLock(floating), /fixture source/);
    const other = lock();
    other.fixture_source.repository = 'Naohiro2g/scratch-editor';
    assert.throws(() => validateLock(other), /fixture source/);
});

test('fixture LICENSE is accepted and its pinned bytes are checked', () => {
    const value = lock();
    value.fixtures.push({...record, path: 'packages/protocol/test/fixtures/LICENSE'});
    assert.equal(validateLock(value).fixtures.length, 2);
    const invalid = lock();
    invalid.fixtures.push({...record, path: 'packages/protocol/test/fixtures/LICENSE', sha256: 'invalid'});
    assert.throws(() => validateLock(invalid), /identity/);
});

test('acquisition copies and verifies the fixture license using the independent fixture commit', t => {
    const directory = mkdtempSync(join(tmpdir(), 'scratch-fixture-license-'));
    t.after(() => rmSync(directory, {recursive: true, force: true}));
    const source = join(directory, 'source');
    const consumer = join(directory, 'consumer');
    mkdirSync(join(source, 'packages/protocol/test/fixtures'), {recursive: true});
    mkdirSync(join(consumer, 'scripts'), {recursive: true});
    mkdirSync(join(consumer, 'mc-remote'), {recursive: true});
    const license = Buffer.from('MIT License\n\nCopyright (c) 2026 Naohiro Tsuji\n');
    const licenseRecord = {
        path: 'packages/protocol/test/fixtures/LICENSE',
        bytes: license.length,
        sha256: createHash('sha256').update(license)
            .digest('hex')
    };
    writeFileSync(join(source, record.path), bytes);
    writeFileSync(join(source, licenseRecord.path), license);
    execFileSync('git', ['init', '--quiet', source]);
    execFileSync('git', ['add', '.'], {cwd: source});
    execFileSync('git', ['-c', 'user.name=Fixture test', '-c', 'user.email=fixture@example.invalid',
        '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '--no-gpg-sign', '-m', 'fixture'], {cwd: source});
    const value = lock();
    value.fixture_source.commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: source, encoding: 'utf8'}).trim();
    value.fixtures.push(licenseRecord);
    writeFileSync(join(consumer, 'mc-remote/tooling-lock.json'), JSON.stringify(value));
    const script = join(consumer, 'scripts/acquire-mcremote-tooling.mjs');
    copyFileSync(fileURLToPath(new URL('./acquire-mcremote-tooling.mjs', import.meta.url)), script);
    execFileSync(process.execPath, [script, '--fixtures', '--source-dir', source]);
    const destination = join(consumer, 'mc-remote/tooling/fixtures/protocol/test/fixtures');
    assert.deepEqual(readFileSync(join(destination, 'events-v23.json')), bytes);
    assert.deepEqual(readFileSync(join(destination, 'LICENSE')), license);
    execFileSync(process.execPath, [script, '--fixtures']);
    chmodSync(join(destination, 'LICENSE'), 0o644);
    writeFileSync(join(destination, 'LICENSE'), Buffer.from(license.toString().replace('MIT', 'mit')));
    assert.throws(() => execFileSync(process.execPath, [script, '--fixtures'], {stdio: 'pipe'}),
        /tooling file identity mismatch: packages\/protocol\/test\/fixtures\/LICENSE/);
});
