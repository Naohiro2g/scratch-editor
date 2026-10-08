import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {closeSync, mkdirSync, openSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {localArtifacts} from './mcremote-local-artifacts.mjs';

export const validateCandidateMetadata = (metadata, {commit, artifactId, artifactDigest}) => {
    if (
        !/^[a-f0-9]{40}$/.test(commit) ||
        !Number.isSafeInteger(artifactId) ||
        artifactId < 1 ||
        !/^sha256:[a-f0-9]{64}$/.test(artifactDigest) ||
        metadata.id !== artifactId ||
        metadata.expired ||
        metadata.name !== `scratch-candidate-${commit}` ||
        metadata.digest !== artifactDigest ||
        metadata.workflow_run.head_sha !== commit
    ) {
        throw new Error('Scratch Local candidate metadata differs from frozen identity');
    }
};

export const validateCandidateRun = (run, commit) => {
    if (
        run.head_sha !== commit ||
        run.status !== 'completed' ||
        run.conclusion !== 'success' ||
        run.path !== '.github/workflows/mc-remote-candidate.yml' ||
        run.head_repository.full_name !== 'Naohiro2g/scratch-editor'
    ) {
        throw new Error('Scratch Local candidate must come from the successful owner candidate workflow');
    }
};

const main = () => {
    const [commit, version, id, artifactDigest] = process.argv.slice(2);
    const artifactId = Number(id);
    const endpoint = `repos/Naohiro2g/scratch-editor/actions/artifacts/${artifactId}`;
    const metadata = JSON.parse(execFileSync('gh', ['api', endpoint], {encoding: 'utf8'}));
    validateCandidateMetadata(metadata, {commit, artifactId, artifactDigest});
    const run = JSON.parse(
        execFileSync(
            'gh',
            ['api', `repos/Naohiro2g/scratch-editor/actions/runs/${metadata.workflow_run.id}`],
            {encoding: 'utf8'}
        )
    );
    validateCandidateRun(run, commit);
    const directory = 'candidate';
    mkdirSync(directory, {recursive: true});
    const archive = join(directory, 'scratch-local-candidate.zip');
    const descriptor = openSync(archive, 'w');
    try {
        execFileSync('gh', ['api', `${endpoint}/zip`], {stdio: ['ignore', descriptor, 'pipe']});
    } finally {
        closeSync(descriptor);
    }
    if (`sha256:${createHash('sha256').update(readFileSync(archive))
        .digest('hex')}` !== artifactDigest) {
        throw new Error('Scratch Local candidate archive digest mismatch');
    }
    const extract = file => execFileSync('unzip', ['-p', archive, file], {maxBuffer: 1024 * 1024 * 1024});
    const candidate = JSON.parse(extract('candidate-manifest.json'));
    if (
        candidate.schema !== 'mc-remote.candidate-manifest' ||
        candidate.schema_version !== 1 ||
        candidate.source.commit !== commit ||
        candidate.source.repository !== 'https://github.com/Naohiro2g/scratch-editor' ||
        candidate.version !== version
    ) {
        throw new Error('Scratch Local candidate manifest identity mismatch');
    }
    for (const [os, arch] of [
        ['windows', 'x64'],
        ['macos', 'arm64'],
        ['linux', 'x64']
    ]) {
        const file = `mc-remote-scratch-local-${version}-${os}-${arch}.zip`;
        for (const name of [file, file.replace(/\.zip$/, '.artifact.json')]) {
            writeFileSync(join(directory, name), extract(name));
        }
    }
    const releaseFiles = localArtifacts({directory, version, commit, release: true});
    const frozenFiles = candidate.artifacts.filter(item => item.role === 'scratch-local');
    if (
        frozenFiles.length !== 3 ||
        !releaseFiles.every(item =>
            frozenFiles.some(
                frozen =>
                    frozen.kind === 'file' &&
                    frozen.file === item.file &&
                    frozen.os === item.os &&
                    frozen.arch === item.arch &&
                    frozen.bytes === item.bytes &&
                    frozen.sha256 === item.sha256
            )
        )
    ) {
        throw new Error('Scratch Local files differ from the frozen candidate manifest');
    }
    writeFileSync(
        join(directory, 'scratch-local-artifacts.json'),
        `${JSON.stringify(releaseFiles, null, 2)}\n`
    );
    process.stdout.write(`Scratch Local: collected 3 unchanged ZIPs from artifact ${artifactId}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
