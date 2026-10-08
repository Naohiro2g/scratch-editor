import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyBytes} from './acquire-mcremote-tooling.mjs';
import {localArtifacts} from './mcremote-local-artifacts.mjs';
import {loadContract} from './release-manifest-contract.mjs';

export const buildReleaseManifest = ({
    root = process.cwd(), contract, releaseTag, commit, scratchDigest, bridgeDigest, baseline
}) => {
    if (!/^v2320\.0\.0b\d+$/.test(releaseTag) || !/^[a-f0-9]{40}$/.test(commit)) {
        throw new Error('release manifest requires an exact Scratch release tag and source commit');
    }
    if (baseline) contract.validate(baseline);
    const digest = scratchDigest || contract.select(baseline, 'scratch', 'oci').digest;
    const lock = JSON.parse(readFileSync(join(root, 'mc-remote/tooling-lock.json')));
    if (bridgeDigest !== lock.artifacts.bridge_digest) {
        throw new Error('release manifest Bridge digest differs from tooling lock');
    }
    const files = [
        ['wirescope', 'wirescope-app.zip'], ['wirescope-manifest', 'wirescope-app.manifest.json'],
        ['contracts', 'contracts.tar.gz']
    ].map(([role, file]) => {
        const path = role === 'contracts' ? join(root, file) : join(root, 'mc-remote/tooling/artifacts', file);
        const body = readFileSync(path);
        if (role !== 'contracts') {
            const pinned = lock.artifacts.files.find(entry => entry.file === file);
            if (!pinned) throw new Error(`release manifest missing tooling identity: ${file}`);
            verifyBytes(pinned, body);
        }
        return {
            role,
            kind: 'https-file',
            file,
            bytes: body.length,
            sha256: createHash('sha256').update(body)
                .digest('hex')
        };
    });
    return contract.validate({
        schema: 'mc-remote.release-manifest',
        schema_version: 2,
        release_tag: releaseTag,
        source_commit: commit,
        artifacts: [
            {role: 'scratch', kind: 'oci', locator: 'ghcr.io/naohiro2g/mc-remote-scratch', digest},
            {role: 'bridge', kind: 'oci', locator: 'ghcr.io/naohiro2g/mc-remote-bridge', digest: bridgeDigest},
            ...files,
            ...localArtifacts({directory: join(root, 'candidate'), version: releaseTag.slice(1), commit, release: true})
        ]
    });
};

const main = async () => {
    const contract = await loadContract();
    const baselinePath = resolve('baseline/manifest.json');
    const manifest = buildReleaseManifest({
        contract,
        releaseTag: process.env.RELEASE_TAG,
        commit: process.env.RELEASE_COMMIT,
        scratchDigest: process.env.SCRATCH_DIGEST,
        bridgeDigest: process.env.BRIDGE_DIGEST,
        baseline: existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath)) : null
    });
    writeFileSync('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => {
        process.stderr.write(`build-mcremote-release-manifest: ${error.message}\n`);
        process.exitCode = 1;
    });
}
