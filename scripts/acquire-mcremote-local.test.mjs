import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateCandidateMetadata, validateCandidateRun} from './acquire-mcremote-local.mjs';

const commit = 'a'.repeat(40);
const expected = {commit, artifactId: 123, artifactDigest: `sha256:${'b'.repeat(64)}`};
const metadata = {
    id: 123,
    expired: false,
    name: `scratch-candidate-${commit}`,
    digest: expected.artifactDigest,
    workflow_run: {head_sha: commit}
};

test('accepts only explicitly pinned candidate identity', () => {
    validateCandidateMetadata(metadata, expected);
    for (const change of [
        {id: 456},
        {expired: true},
        {name: 'latest'},
        {digest: `sha256:${'c'.repeat(64)}`},
        {workflow_run: {head_sha: 'd'.repeat(40)}}
    ]) {
        assert.throws(() => validateCandidateMetadata({...metadata, ...change}, expected), /frozen identity/);
    }
});

test('requires completed successful owner build rather than a matching fork or unrelated workflow', () => {
    const run = {
        head_sha: commit,
        status: 'completed',
        conclusion: 'success',
        path: '.github/workflows/mc-remote-candidate.yml',
        head_repository: {full_name: 'Naohiro2g/scratch-editor'}
    };
    validateCandidateRun(run, commit);
    for (const change of [
        {conclusion: 'failure'},
        {status: 'in_progress'},
        {path: 'other.yml'},
        {head_repository: {full_name: 'other/fork'}}
    ]) {
        assert.throws(() => validateCandidateRun({...run, ...change}, commit), /owner candidate/);
    }
});
