// CLI wrapper around `pages-artifact.mjs`, run by the GitHub Pages workflow before the artifact
// upload. Kept separate from the prune step so a failure names which of the two went wrong.

import {writeShowcaseRuntimeConfig} from './pages-artifact.mjs';

const [buildDir, releaseIdentity] = process.argv.slice(2);
if (!buildDir || !releaseIdentity) {
    console.error('usage: node scripts/write-showcase-runtime-config.mjs <build-dir> <release-identity>');
    process.exit(1);
}

const showcase = writeShowcaseRuntimeConfig(buildDir, releaseIdentity);
console.log(`write-showcase-runtime-config: connection_enabled=${showcase.connection_enabled}`);
console.log(`write-showcase-runtime-config: release_identity=${showcase.release_identity}`);
