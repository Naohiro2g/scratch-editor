// GitHub Pages serves every file in the build directory, but `index.html` is the only entry
// that loads `mc-remote-runtime-config.json` and pushes it into the VM. Every other entry runs
// on the built-in defaults, which enable the McRemote connection and point at the production
// bridge, so publishing them would let a viewer reach a real sandbox from a deployment whose
// runtime config sets `connection_enabled` to false. Drop those entries from what Pages serves.

import fs from 'fs';
import path from 'path';

/** Entry documents webpack emits into `build/`, mapped to the bundle each one loads. */
const ENTRY_CHUNKS = Object.freeze({
    'index.html': 'gui',
    'standalone.html': 'guistandalone',
    'blocks-only.html': 'blocksonly',
    'compatibility-testing.html': 'compatibilitytesting',
    'player.html': 'player'
});

/** Entries that apply the McRemote runtime config, and are therefore safe to publish. */
const RUNTIME_CONFIG_AWARE_ENTRIES = Object.freeze(['index.html']);

/**
 * Decide which entry documents may be published to GitHub Pages.
 * @param {Array<string>} fileNames - names of the files present in the build directory.
 * @returns {{keep: Array<string>, remove: Array<{html: string, chunk: string}>}} publish plan.
 * @throws {Error} when an entry document is not classified, or a publishable one is absent.
 */
const planPagesArtifact = fileNames => {
    const htmlFiles = fileNames.filter(name => name.endsWith('.html'));
    const unknown = htmlFiles.filter(name => !Object.prototype.hasOwnProperty.call(ENTRY_CHUNKS, name));
    if (unknown.length > 0) {
        throw new Error(
            `planPagesArtifact: unclassified entry document(s): ${unknown.join(', ')}. ` +
            'Decide whether each one applies the McRemote runtime config, then add it to ' +
            'ENTRY_CHUNKS and, when it does, to RUNTIME_CONFIG_AWARE_ENTRIES.'
        );
    }

    const missing = RUNTIME_CONFIG_AWARE_ENTRIES.filter(name => !htmlFiles.includes(name));
    if (missing.length > 0) {
        throw new Error(`planPagesArtifact: build is missing publishable entry document(s): ${missing.join(', ')}`);
    }

    return {
        keep: htmlFiles.filter(name => RUNTIME_CONFIG_AWARE_ENTRIES.includes(name)),
        remove: htmlFiles
            .filter(name => !RUNTIME_CONFIG_AWARE_ENTRIES.includes(name))
            .map(name => ({html: name, chunk: ENTRY_CHUNKS[name]}))
    };
};

/**
 * Apply the publish plan in place, deleting each dropped entry and its bundle.
 * @param {string} buildDir - directory holding the webpack `build` output.
 * @returns {{keep: Array<string>, remove: Array<{html: string, chunk: string}>}} the plan applied.
 */
const prunePagesArtifact = buildDir => {
    const plan = planPagesArtifact(fs.readdirSync(buildDir));
    for (const {html, chunk} of plan.remove) {
        for (const name of [html, `${chunk}.js`, `${chunk}.js.map`]) {
            fs.rmSync(path.join(buildDir, name), {force: true});
        }
    }
    return plan;
};

export {planPagesArtifact, prunePagesArtifact};
