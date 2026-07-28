// CLI wrapper around `pages-artifact.mjs`, run by the GitHub Pages workflow between the build
// and the artifact upload. The planning logic lives in the imported module so it can be tested.

import {prunePagesArtifact} from './pages-artifact.mjs';

const buildDir = process.argv[2];
if (!buildDir) {
    console.error('usage: node scripts/prune-pages-artifact.mjs <build-dir>');
    process.exit(1);
}

const plan = prunePagesArtifact(buildDir);
console.log(`prune-pages-artifact: published ${plan.keep.join(', ')}`);
console.log(`prune-pages-artifact: dropped ${plan.remove.map(entry => entry.html).join(', ')}`);
