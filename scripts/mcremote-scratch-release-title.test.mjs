import assert from 'node:assert/strict';
import test from 'node:test';

import {titleFromScratchReleaseTag} from './mcremote-scratch-release-title.mjs';

test('derives the Scratch release title from its tag', () => {
    for (const [tag, title] of [
        ['v2320.0.0b8', 'mc-remote Scratch 2320.0.0b8'],
        ['v2301.0.0b7-post1', 'mc-remote Scratch 2301.0.0b7-post1'],
        ['v2301.0.0b7.post2', 'mc-remote Scratch 2301.0.0b7.post2'],
        ['v2320.0.0', 'mc-remote Scratch 2320.0.0']
    ]) {
        assert.equal(titleFromScratchReleaseTag(tag), title);
    }
});

test('rejects tags from the npm and plugin release series', () => {
    for (const tag of ['v15.1.0', 'v1.21.11-2320.0.0b8']) {
        assert.throws(() => titleFromScratchReleaseTag(tag));
    }
});
