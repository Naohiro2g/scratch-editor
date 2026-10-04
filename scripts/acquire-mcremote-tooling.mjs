import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(repository, 'mc-remote/tooling');
const expectedRepository = 'Naohiro2g/minecraft-remote-tooling';
const artifactFiles = ['wirescope-app.zip', 'wirescope-app.manifest.json', 'bridge.oci.tar', 'candidate-manifest.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export const validateLock = lock => {
    if (lock.schema !== 'mcremote.tooling-lock' || lock.schema_version !== 1 ||
        lock.source.repository !== expectedRepository || !/^[0-9a-f]{40}$/.test(lock.source.commit)) {
        throw new Error('tooling lock must pin the approved repository and a full source commit');
    }
    const paths = new Set();
    for (const entry of lock.fixtures) {
        if (!/^packages\/(protocol|live|bridge)\/test\/fixtures\/[a-z0-9.-]+$/.test(entry.path) ||
            paths.has(entry.path)) throw new Error(`invalid or duplicate tooling fixture path: ${entry.path}`);
        paths.add(entry.path);
        validateIdentity(entry);
    }
    if (lock.artifacts) {
        if (!Number.isSafeInteger(lock.artifacts.github_artifact_id) || lock.artifacts.github_artifact_id < 1 ||
            !/^sha256:[0-9a-f]{64}$/.test(lock.artifacts.github_artifact_digest)) {
            throw new Error('tooling artifacts must pin a GitHub artifact ID and digest');
        }
        const files = lock.artifacts.files.map(entry => entry.file);
        if (files.length !== artifactFiles.length || !artifactFiles.every(file => files.includes(file))) {
            throw new Error('tooling artifacts must include the exact WireScope pair, Bridge OCI and candidate manifest');
        }
        lock.artifacts.files.forEach(validateIdentity);
        if (!/^sha256:[0-9a-f]{64}$/.test(lock.artifacts.bridge_digest)) throw new Error('invalid Bridge OCI digest');
    }
    return lock;
};

const validateIdentity = entry => {
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
        throw new Error(`invalid tooling file identity: ${entry.path || entry.file}`);
    }
};

export const verifyBytes = (entry, bytes) => {
    if (bytes.byteLength !== entry.bytes || hash(bytes) !== entry.sha256) {
        throw new Error(`tooling file identity mismatch: ${entry.path || entry.file}; expected ${entry.bytes} bytes / ${entry.sha256}, got ${bytes.byteLength} bytes / ${hash(bytes)}`);
    }
    return bytes;
};

const writeVerified = (entry, bytes, destination) => {
    verifyBytes(entry, bytes);
    mkdirSync(dirname(destination), {recursive: true});
    const temporary = `${destination}.${process.pid}.tmp`;
    writeFileSync(temporary, bytes);
    chmodSync(temporary, 0o444);
    renameSync(temporary, destination);
};

const acquireFixtures = async (lock, sourceDirectory) => {
    if (sourceDirectory) {
        const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: sourceDirectory, encoding: 'utf8'}).trim();
        if (head !== lock.source.commit) throw new Error('fixture source checkout does not match the tooling lock');
    }
    for (const entry of lock.fixtures) {
        const destination = join(cache, 'fixtures', entry.path.slice('packages/'.length));
        if (!sourceDirectory && existsSync(destination)) {
            verifyBytes(entry, readFileSync(destination));
            continue;
        }
        let bytes;
        if (sourceDirectory) bytes = readFileSync(join(sourceDirectory, entry.path));
        else {
            const response = await fetch(`https://raw.githubusercontent.com/${lock.source.repository}/${lock.source.commit}/${entry.path}`);
            if (!response.ok) throw new Error(`tooling fixture download failed: ${entry.path} HTTP ${response.status}`);
            bytes = Buffer.from(await response.arrayBuffer());
        }
        writeVerified(entry, bytes, destination);
    }
    process.stdout.write(`tooling fixtures: ${lock.fixtures.length} verified at ${lock.source.commit}\n`);
};

const validateArtifacts = (lock, directory) => {
    const artifacts = lock.artifacts;
    for (const entry of artifacts.files) verifyBytes(entry, readFileSync(join(directory, entry.file)));
    const candidate = JSON.parse(readFileSync(join(directory, 'candidate-manifest.json'), 'utf8'));
    if (candidate.source.repository !== `https://github.com/${lock.source.repository}` || candidate.source.commit !== lock.source.commit) {
        throw new Error('candidate manifest source does not match the tooling lock');
    }
    for (const entry of artifacts.files.filter(item => item.file !== 'candidate-manifest.json')) {
        const record = candidate.artifacts.find(item => item.file === entry.file);
        if (!record || record.bytes !== entry.bytes || record.sha256 !== entry.sha256) throw new Error(`candidate manifest identity mismatch: ${entry.file}`);
    }
    const bridge = candidate.artifacts.find(item => item.role === 'bridge');
    if (bridge.digest !== artifacts.bridge_digest) throw new Error('candidate manifest Bridge digest mismatch');
    const manifest = JSON.parse(readFileSync(join(directory, 'wirescope-app.manifest.json'), 'utf8'));
    if (manifest.source.commit !== lock.source.commit || manifest.source.repository !== `https://github.com/${lock.source.repository}` ||
        manifest.source.subdirectory !== 'packages/live' ||
        manifest.archive.sha256 !== artifacts.files.find(item => item.file === 'wirescope-app.zip').sha256) {
        throw new Error('WireScope manifest source or archive identity mismatch');
    }
    const archive = join(directory, 'bridge.oci.tar');
    const indexBytes = execFileSync('tar', ['-xOf', archive, 'index.json']);
    const index = JSON.parse(indexBytes);
    const digest = artifacts.bridge_digest.slice('sha256:'.length);
    if (hash(indexBytes) !== digest) {
        if (!index.manifests.some(item => item.digest === artifacts.bridge_digest)) throw new Error('Bridge OCI index does not reference the pinned digest');
        const blob = execFileSync('tar', ['-xOf', archive, `blobs/sha256/${digest}`]);
        if (hash(blob) !== digest) throw new Error('Bridge OCI manifest digest mismatch');
    }
};

const acquireArtifacts = (lock, artifactDirectory) => {
    if (!lock.artifacts) throw new Error('tooling artifacts have not been pinned');
    const directory = join(cache, 'artifacts');
    if (artifactDirectory) {
        validateArtifacts(lock, artifactDirectory);
        for (const entry of lock.artifacts.files) writeVerified(entry, readFileSync(join(artifactDirectory, entry.file)), join(directory, entry.file));
    } else if (lock.artifacts.files.every(entry => existsSync(join(directory, entry.file)))) {
        validateArtifacts(lock, directory);
    } else {
        const endpoint = `repos/${lock.source.repository}/actions/artifacts/${lock.artifacts.github_artifact_id}`;
        const metadata = JSON.parse(execFileSync('gh', ['api', endpoint], {encoding: 'utf8'}));
        if (metadata.expired || metadata.digest !== lock.artifacts.github_artifact_digest || metadata.workflow_run.head_sha !== lock.source.commit) {
            throw new Error('GitHub artifact metadata does not match the tooling lock');
        }
        mkdirSync(directory, {recursive: true});
        const outerArchive = join(directory, 'github-artifact.zip');
        const descriptor = openSync(outerArchive, 'w');
        try {
            execFileSync('gh', ['api', `${endpoint}/zip`], {stdio: ['ignore', descriptor, 'pipe']});
        } finally {
            closeSync(descriptor);
        }
        if (`sha256:${hash(readFileSync(outerArchive))}` !== lock.artifacts.github_artifact_digest) throw new Error('GitHub artifact archive digest mismatch');
        for (const entry of lock.artifacts.files) {
            const bytes = execFileSync('unzip', ['-p', outerArchive, entry.file], {maxBuffer: Math.max(entry.bytes * 2, 1024 * 1024)});
            writeVerified(entry, bytes, join(directory, entry.file));
        }
        validateArtifacts(lock, directory);
    }
    process.stdout.write(`tooling artifacts: WireScope pair and Bridge OCI verified at ${lock.source.commit}\n`);
};

const main = async () => {
    const args = process.argv.slice(2);
    const allowed = new Set(['--fixtures', '--artifacts', '--source-dir', '--artifact-dir']);
    const options = {};
    while (args.length) {
        const option = args.shift();
        if (!allowed.has(option)) throw new Error(`unknown tooling acquisition option: ${option}`);
        options[option] = option.endsWith('-dir') ? args.shift() : true;
        if (option.endsWith('-dir') && !options[option]) throw new Error(`${option} requires a directory`);
    }
    const lock = validateLock(JSON.parse(readFileSync(join(repository, 'mc-remote/tooling-lock.json'), 'utf8')));
    if (options['--fixtures']) await acquireFixtures(lock, options['--source-dir']);
    if (options['--artifacts']) acquireArtifacts(lock, options['--artifact-dir']);
    if (!options['--fixtures'] && !options['--artifacts']) throw new Error('--fixtures or --artifacts is required');
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => {
        process.stderr.write(`acquire-mcremote-tooling: ${error.message}\n`);
        process.exitCode = 1;
    });
}
