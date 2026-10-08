import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {localArtifacts} from './mcremote-local-artifacts.mjs';

const setup = t => {
    const directory = mkdtempSync(join(tmpdir(), 'scratch-local-manifest-'));
    t.after(() => rmSync(directory, {recursive: true, force: true}));
    const options = {directory, version: '2320.0.0b10', commit: 'a'.repeat(40)};
    for (const [os, arch] of [
        ['windows', 'x64'],
        ['macos', 'arm64'],
        ['linux', 'x64']
    ]) {
        const file = `mc-remote-scratch-local-${options.version}-${os}-${arch}.zip`;
        const bytes = Buffer.from(file);
        writeFileSync(join(directory, file), bytes);
        writeFileSync(
            join(directory, file.replace(/\.zip$/, '.artifact.json')),
            JSON.stringify({
                role: 'scratch-local',
                kind: 'file',
                os,
                arch,
                file,
                bytes: bytes.length,
                sha256: createHash('sha256').update(bytes)
                    .digest('hex'),
                source_commit: options.commit,
                working_tree_dirty: false
            })
        );
    }
    return options;
};

test('keeps candidate file kind and emits release https-file with unambiguous OS/arch', t => {
    const options = setup(t);
    assert.equal(localArtifacts(options).length, 3);
    const artifacts = localArtifacts({...options, release: true});
    assert.equal(new Set(artifacts.map(item => `${item.role}/${item.os}/${item.arch}`)).size, 3);
    assert.ok(
        artifacts.every(item => item.kind === 'https-file' && item.bytes > 0 && item.sha256.length === 64)
    );
    assert.ok(artifacts.every(item => !('source_commit' in item)));
});

test('rejects corrupt bytes, swapped platforms and source mismatch', t => {
    const options = setup(t);
    assert.throws(() => localArtifacts({...options, commit: 'b'.repeat(40)}), /identity mismatch/);
    const item = localArtifacts(options)[0];
    const sidecar = join(options.directory, item.file.replace(/\.zip$/, '.artifact.json'));
    const identity = JSON.parse(readFileSync(sidecar));
    writeFileSync(sidecar, JSON.stringify({...identity, os: 'macos'}));
    assert.throws(() => localArtifacts(options), /identity mismatch/);
    writeFileSync(sidecar, JSON.stringify(identity));
    writeFileSync(join(options.directory, item.file), 'corrupt');
    assert.throws(() => localArtifacts(options), /identity mismatch/);
});

test('permits explicit local drafts for candidate but prevents publishing them', t => {
    const options = setup(t);
    const file = localArtifacts(options)[0].file.replace(/\.zip$/, '.artifact.json');
    const identity = JSON.parse(readFileSync(join(options.directory, file)));
    writeFileSync(join(options.directory, file), JSON.stringify({...identity, working_tree_dirty: true}));
    assert.equal(localArtifacts(options).length, 3);
    assert.throws(() => localArtifacts({...options, release: true}), /Cannot publish a dirty/);
});
