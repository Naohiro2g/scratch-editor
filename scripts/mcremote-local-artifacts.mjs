import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const localArtifacts = ({directory, version, commit, release = false}) => {
    if (!/^2320\.0\.0b\d+$/.test(version) || !/^[a-f0-9]{40}$/.test(commit)) {
        throw new Error('Scratch Local requires an exact version and source commit');
    }
    return [
        ['windows', 'x64'],
        ['macos', 'arm64'],
        ['linux', 'x64']
    ].map(([os, arch]) => {
        const file = `mc-remote-scratch-local-${version}-${os}-${arch}.zip`;
        const identity = JSON.parse(readFileSync(join(directory, file.replace(/\.zip$/, '.artifact.json'))));
        const bytes = readFileSync(join(directory, file));
        const sha256 = createHash('sha256').update(bytes)
            .digest('hex');
        if (
            identity.role !== 'scratch-local' ||
            identity.kind !== 'file' ||
            identity.os !== os ||
            identity.arch !== arch ||
            identity.file !== file ||
            identity.bytes !== bytes.length ||
            identity.sha256 !== sha256 ||
            identity.source_commit !== commit ||
            typeof identity.working_tree_dirty !== 'boolean'
        ) {
            throw new Error(`Scratch Local identity mismatch: ${file}`);
        }
        if (release && identity.working_tree_dirty) {
            throw new Error(`Cannot publish a dirty Scratch Local build: ${file}`);
        }
        return {
            role: 'scratch-local',
            kind: release ? 'https-file' : 'file',
            os,
            arch,
            file,
            bytes: bytes.length,
            sha256
        };
    });
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const [directory, version, commit, mode] = process.argv.slice(2);
    if (!['release', 'candidate'].includes(mode)) throw new Error('mode must be release or candidate');
    process.stdout.write(
        `${JSON.stringify(localArtifacts({directory, version, commit, release: mode === 'release'}), null, 2)}\n`
    );
}
