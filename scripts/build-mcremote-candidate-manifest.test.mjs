import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const script = fileURLToPath(new URL('./build-mcremote-candidate-manifest.mjs', import.meta.url));
const setup = t => {
    const directory = mkdtempSync(join(tmpdir(), 'scratch-candidate-test-'));
    t.after(() => rmSync(directory, {recursive: true, force: true}));
    mkdirSync(join(directory, 'mc-remote'));
    mkdirSync(join(directory, 'candidate'));
    const files = ['scratch-gui.tar.gz', 'scratch.oci.tar', 'bridge.oci.tar',
        'wirescope-app.zip', 'wirescope-app.manifest.json', 'contracts.tar.gz'];
    for (const file of files) writeFileSync(join(directory, 'candidate', file), `${file}\n`);
    for (const [os, arch] of [['windows', 'x64'], ['macos', 'arm64'], ['linux', 'x64']]) {
        const file = `mc-remote-scratch-local-2320.0.0b10-${os}-${arch}.zip`;
        const bytes = Buffer.from(file);
        writeFileSync(join(directory, 'candidate', file), bytes);
        writeFileSync(join(directory, 'candidate', file.replace(/\.zip$/, '.artifact.json')), JSON.stringify({
            role: 'scratch-local', kind: 'file', os, arch, file, bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'), source_commit: 'a'.repeat(40), working_tree_dirty: false
        }));
    }
    const pinnedFiles = files.slice(2, 5).map(file => {
        const bytes = readFileSync(join(directory, 'candidate', file));
        return {file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
    });
    writeFileSync(join(directory, 'mc-remote/tooling-lock.json'), JSON.stringify({
        source: {repository: 'Naohiro2g/minecraft-remote-tooling', commit: 'b'.repeat(40)},
        artifacts: {bridge_digest: `sha256:${'c'.repeat(64)}`, files: pinnedFiles}
    }));
    return directory;
};

test('candidate records its own source and preserves pinned tooling identities', t => {
    const cwd = setup(t);
    execFileSync(process.execPath, [script, 'a'.repeat(40), `sha256:${'d'.repeat(64)}`], {cwd});
    const manifest = JSON.parse(readFileSync(join(cwd, 'candidate/candidate-manifest.json')));
    assert.equal(manifest.source.commit, 'a'.repeat(40));
    assert.equal(manifest.tooling.commit, 'b'.repeat(40));
    assert.equal(manifest.artifacts.length, 9);
    assert.equal(manifest.version, '2320.0.0b10');
    assert.equal(manifest.artifacts.find(item => item.role === 'bridge').digest, `sha256:${'c'.repeat(64)}`);
    assert.equal(manifest.artifacts.find(item => item.role === 'scratch').digest, `sha256:${'d'.repeat(64)}`);
});

test('candidate rejects corrupted tooling bytes and floating source identities', t => {
    const cwd = setup(t);
    writeFileSync(join(cwd, 'candidate/wirescope-app.zip'), 'corrupt\n');
    assert.throws(() => execFileSync(process.execPath, [script, 'a'.repeat(40), `sha256:${'d'.repeat(64)}`],
        {cwd, stdio: 'pipe'}), /candidate file differs/);
    assert.throws(() => execFileSync(process.execPath, [script, 'develop', `sha256:${'d'.repeat(64)}`],
        {cwd, stdio: 'pipe'}), /exact source commit/);
});
