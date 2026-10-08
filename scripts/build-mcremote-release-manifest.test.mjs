import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {buildReleaseManifest} from './build-mcremote-release-manifest.mjs';
import {loadContract} from './release-manifest-contract.mjs';

const commit = 'a'.repeat(40);
const scratchDigest = `sha256:${'b'.repeat(64)}`;
const bridgeDigest = `sha256:${'c'.repeat(64)}`;
const contract = await loadContract();
const hash = bytes => createHash('sha256').update(bytes)
    .digest('hex');
const setup = t => {
    const root = mkdtempSync(join(tmpdir(), 'scratch-release-test-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const artifacts = join(root, 'mc-remote/tooling/artifacts');
    const candidate = join(root, 'candidate');
    mkdirSync(artifacts, {recursive: true});
    mkdirSync(candidate);
    const files = ['wirescope-app.zip', 'wirescope-app.manifest.json'].map(file => {
        const body = Buffer.from(`synthetic ${file}\n`);
        writeFileSync(join(artifacts, file), body);
        return {file, bytes: body.length, sha256: hash(body)};
    });
    writeFileSync(join(root, 'mc-remote/tooling-lock.json'), JSON.stringify({
        artifacts: {bridge_digest: bridgeDigest, files}
    }));
    writeFileSync(join(root, 'contracts.tar.gz'), 'synthetic contracts\n');
    for (const [os, arch] of [['windows', 'x64'], ['macos', 'arm64'], ['linux', 'x64']]) {
        const file = `mc-remote-scratch-local-2320.0.0b10-${os}-${arch}.zip`;
        const body = Buffer.from(file);
        writeFileSync(join(candidate, file), body);
        writeFileSync(join(candidate, file.replace(/\.zip$/, '.artifact.json')), JSON.stringify({
            role: 'scratch-local',
            kind: 'file',
            file,
            os,
            arch,
            bytes: body.length,
            sha256: hash(body),
            source_commit: commit,
            working_tree_dirty: false
        }));
    }
    return {root, contract, releaseTag: 'v2320.0.0b10', commit, scratchDigest, bridgeDigest};
};

test('public v2 records the actual six file sizes and preserves OCI digests', t => {
    const options = setup(t);
    const manifest = buildReleaseManifest(options);
    assert.equal(manifest.schema_version, 2);
    assert.equal(manifest.source_commit, commit);
    assert.equal(manifest.artifacts.length, 8);
    assert.equal(contract.select(manifest, 'scratch', 'oci').digest, scratchDigest);
    assert.equal(contract.select(manifest, 'bridge', 'oci').digest, bridgeDigest);
    for (const artifact of manifest.artifacts.filter(entry => entry.kind === 'https-file')) {
        const directory = artifact.role === 'contracts' ? options.root : artifact.role === 'scratch-local' ?
            join(options.root, 'candidate') : join(options.root, 'mc-remote/tooling/artifacts');
        const body = readFileSync(join(directory, artifact.file));
        assert.equal(artifact.bytes, body.length);
        assert.equal(artifact.sha256, hash(body));
    }
});

test('release rejects changed pinned bytes, dirty native ZIPs, and Bridge digest drift', t => {
    const options = setup(t);
    assert.throws(() => buildReleaseManifest({...options, bridgeDigest: scratchDigest}), /Bridge digest/);
    const sidecar = join(options.root, 'candidate/mc-remote-scratch-local-2320.0.0b10-windows-x64.artifact.json');
    const identity = JSON.parse(readFileSync(sidecar));
    identity.working_tree_dirty = true;
    writeFileSync(sidecar, JSON.stringify(identity));
    assert.throws(() => buildReleaseManifest(options), /dirty/);
    identity.working_tree_dirty = false;
    writeFileSync(sidecar, JSON.stringify(identity));
    writeFileSync(join(options.root, 'mc-remote/tooling/artifacts/wirescope-app.zip'), 'changed');
    assert.throws(() => buildReleaseManifest(options), /identity mismatch/);
});

test('baseline OCI selection accepts v1 and v2 and rejects malformed unused entries', t => {
    const options = setup(t);
    const baseline = buildReleaseManifest(options);
    for (const schemaVersion of [1, 2]) {
        const prior = {...baseline, schema_version: schemaVersion, artifacts: baseline.artifacts.slice(0, 2)};
        const reused = buildReleaseManifest({...options, scratchDigest: '', baseline: prior});
        assert.equal(reused.artifacts[0].digest, scratchDigest);
    }
    baseline.artifacts.push({role: 'unused', kind: 'https-file', file: 'bad', sha256: 'a'.repeat(64)});
    assert.throws(() => buildReleaseManifest({...options, scratchDigest: '', baseline}), /schema_invalid/);
});
