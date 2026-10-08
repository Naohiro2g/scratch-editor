import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {verifyBytes} from './acquire-mcremote-tooling.mjs';
import {validateContractLock} from './acquire-release-manifest-contract.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const loadContract = async ({
    lockPath = join(repository, 'mc-remote/release-manifest-lock.json'),
    cacheDirectory = join(repository, 'mc-remote/release-manifest')
} = {}) => {
    const lock = validateContractLock(JSON.parse(readFileSync(lockPath)));
    const bodies = new Map(lock.files.map(entry => {
        const path = join(cacheDirectory, entry.path);
        if (!existsSync(path)) {
            throw new Error(`missing release manifest contract: ${entry.path}; run npm run tooling:release-manifest`);
        }
        return [entry.path, verifyBytes(entry, readFileSync(path))];
    }));
    const checksEntry = lock.files.find(entry => entry.path === 'schemas/release-manifest-checks.mjs');
    const checksUrl = pathToFileURL(join(cacheDirectory, checksEntry.path));
    const checks = await import(`${checksUrl.href}?sha256=${checksEntry.sha256}`);
    const ajv = new Ajv2020({allErrors: true, strict: false});
    const validators = new Map([
        [1, ajv.compile(JSON.parse(bodies.get('schemas/fixtures/release-manifest-v1.schema.json')))],
        [2, ajv.compile(JSON.parse(bodies.get('schemas/release-manifest-v2.schema.json')))]
    ]);
    const evaluate = (manifest, {contents, jarDeclaration} = {}) => {
        const validator = validators.get(manifest?.schema_version);
        if (!validator) return {valid: false, reason: 'unsupported_schema_version', stage: 'version'};
        if (!validator(manifest)) return {valid: false, reason: 'schema_invalid', stage: 'schema'};
        const result = checks.checkManifestSemantics(manifest);
        return result.valid && contents ? checks.checkManifestContents(manifest, contents, jarDeclaration) : result;
    };
    const validate = (manifest, options) => {
        const result = evaluate(manifest, options);
        if (!result.valid) throw new Error(`release manifest rejected: ${result.reason} (${result.stage})`);
        return manifest;
    };
    const select = (manifest, role, kind, {os, arch} = {}) => {
        validate(manifest);
        const entries = manifest.artifacts.filter(entry => entry.role === role);
        const qualified = typeof os !== 'undefined';
        if (qualified !== (typeof arch !== 'undefined') ||
            (!qualified && entries.some(entry => typeof entry.os !== 'undefined'))) {
            throw new Error(`release manifest role ${role} requires both os and arch`);
        }
        const matched = entries.filter(entry => entry.os === os && entry.arch === arch);
        if (matched.length !== 1) throw new Error(`release manifest role ${role} must select exactly one artifact`);
        if (matched[0].kind !== kind) throw new Error(`release manifest role ${role} requires kind ${kind}`);
        return matched[0];
    };
    return {evaluate, validate, select};
};

const main = async () => {
    const [mode, file, role, ...extra] = process.argv.slice(2);
    if (!file || extra.length || !['--validate', '--baseline', '--digest'].includes(mode) ||
        (mode === '--digest') !== Boolean(role)) {
        throw new Error('usage: release-manifest-contract.mjs --validate|--baseline <manifest> | ' +
            '--digest <manifest> <OCI role>');
    }
    const contract = await loadContract();
    const manifest = JSON.parse(readFileSync(file));
    contract.validate(manifest);
    if (mode === '--baseline') {
        contract.select(manifest, 'scratch', 'oci');
        process.stdout.write(`${manifest.source_commit}\n`);
    } else if (mode === '--digest') process.stdout.write(`${contract.select(manifest, role, 'oci').digest}\n`);
    else process.stdout.write(`release manifest v${manifest.schema_version}: valid\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => {
        process.stderr.write(`release-manifest-contract: ${error.message}\n`);
        process.exitCode = 1;
    });
}
