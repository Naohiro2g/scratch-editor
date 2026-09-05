// CLI wrapper around `pages-artifact.mjs`, run by the GitHub Pages workflow before the artifact
// upload. Kept separate from the prune step so a failure names which of the two went wrong.

import {writeShowcaseRuntimeConfig} from './pages-artifact.mjs';

const [buildDir] = process.argv.slice(2);
if (!buildDir) {
    console.error('usage: node scripts/write-showcase-runtime-config.mjs <build-dir>');
    process.exit(1);
}

const {runtime} = writeShowcaseRuntimeConfig(buildDir);
console.log(`write-showcase-runtime-config: connection_enabled=${runtime.connection_enabled}`);
