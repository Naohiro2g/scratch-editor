import {execFileSync} from 'node:child_process';
import {chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {verifyBytes} from './acquire-mcremote-tooling.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paths = [
    'schemas/release-manifest-v2.schema.json',
    'schemas/fixtures/release-manifest-v2.json',
    'schemas/fixtures/release-manifest-v1.schema.json',
    'schemas/release-manifest-checks.mjs',
    'schemas/fixtures/STACK-LICENSE',
    'schemas/README.md'
];

export const validateContractLock = lock => {
    if (lock.schema !== 'mcremote.release-manifest-lock' || lock.schema_version !== 1 ||
        lock.source.repository !== 'Naohiro2g/minecraft-remote-tooling' || !/^[0-9a-f]{40}$/.test(lock.source.commit) ||
        !Array.isArray(lock.files) || lock.files.length !== paths.length) {
        throw new Error('release manifest lock must pin the approved repository, full commit and contract files');
    }
    const seen = new Set();
    for (const entry of lock.files) {
        if (!paths.includes(entry.path) || seen.has(entry.path) ||
            !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
            throw new Error(`invalid release manifest contract file identity: ${entry.path}`);
        }
        seen.add(entry.path);
    }
    return lock;
};

const downloadRemote = async (source, path) => {
    const response = await fetch(`https://raw.githubusercontent.com/${source.repository}/${source.commit}/${path}`);
    if (!response.ok) throw new Error(`release manifest contract download failed: ${path} HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
};

export const acquireContract = async ({lock, destination, sourceDirectory, download = downloadRemote}) => {
    validateContractLock(lock);
    if (sourceDirectory) {
        const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: sourceDirectory, encoding: 'utf8'}).trim();
        if (head !== lock.source.commit) throw new Error('release manifest source checkout does not match the lock');
    }
    for (const entry of lock.files) {
        const target = join(destination, entry.path);
        if (!sourceDirectory && existsSync(target)) {
            verifyBytes(entry, readFileSync(target));
            continue;
        }
        const bytes = sourceDirectory ? readFileSync(join(sourceDirectory, entry.path)) :
            await download(lock.source, entry.path);
        verifyBytes(entry, bytes);
        mkdirSync(dirname(target), {recursive: true});
        const temporary = `${target}.${process.pid}.tmp`;
        writeFileSync(temporary, bytes);
        chmodSync(temporary, 0o444);
        renameSync(temporary, target);
    }
};

const main = async () => {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--source-dir' || !args[1])) {
        throw new Error('usage: acquire-release-manifest-contract.mjs [--source-dir <fixed tooling checkout>]');
    }
    const lock = JSON.parse(readFileSync(join(repository, 'mc-remote/release-manifest-lock.json')));
    await acquireContract({
        lock,
        destination: join(repository, 'mc-remote/release-manifest'),
        sourceDirectory: args[1]
    });
    process.stdout.write(`release manifest contract: ${lock.files.length} files verified at ${lock.source.commit}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => {
        process.stderr.write(`acquire-release-manifest-contract: ${error.message}\n`);
        process.exitCode = 1;
    });
}
