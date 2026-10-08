import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {localArtifacts} from './mcremote-local-artifacts.mjs';

const [commit, scratchDigest] = process.argv.slice(2);
const version = '2320.0.0b10';
if (!/^[a-f0-9]{40}$/.test(commit) || !/^sha256:[a-f0-9]{64}$/.test(scratchDigest)) {
    throw new Error('candidate manifest requires an exact source commit and Scratch OCI digest');
}
const lock = JSON.parse(readFileSync('mc-remote/tooling-lock.json', 'utf8'));
const roles = [
    ['scratch-gui', 'scratch-gui.tar.gz'],
    ['scratch', 'scratch.oci.tar', scratchDigest],
    ['bridge', 'bridge.oci.tar', lock.artifacts.bridge_digest],
    ['wirescope', 'wirescope-app.zip'],
    ['wirescope-manifest', 'wirescope-app.manifest.json'],
    ['contracts', 'contracts.tar.gz']
];
const artifacts = roles.map(([role, file, digest]) => {
    const bytes = readFileSync(`candidate/${file}`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const pinned = lock.artifacts.files.find(entry => entry.file === file);
    if (pinned && (pinned.bytes !== bytes.length || pinned.sha256 !== sha256)) {
        throw new Error(`candidate file differs from the tooling lock: ${file}`);
    }
    return {role, kind: digest ? 'oci-archive' : 'file', file, bytes: bytes.length, sha256, ...(digest ? {digest} : {})};
});
writeFileSync('candidate/candidate-manifest.json', `${JSON.stringify({
    schema: 'mc-remote.candidate-manifest',
    schema_version: 1,
    version,
    source: {repository: 'https://github.com/Naohiro2g/scratch-editor', commit},
    tooling: lock.source,
    artifacts: [...artifacts, ...localArtifacts({directory: 'candidate', version, commit})]
}, null, 2)}\n`);
