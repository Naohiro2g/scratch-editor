import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {test} from 'node:test';
import {loadContract} from './release-manifest-contract.mjs';

const cache = resolve('mc-remote/release-manifest');
const fixture = JSON.parse(readFileSync(join(cache, 'schemas/fixtures/release-manifest-v2.json')));
const contract = await loadContract();

for (const entry of fixture.cases) {
    test(`shared release manifest: ${entry.id}`, () => {
        assert.deepEqual(contract.evaluate(entry.manifest, {
            contents: entry.contents, jarDeclaration: entry.jar_declaration
        }), entry.expected);
    });
}

test('selection requires an exact OS/arch pair and never falls back', () => {
    const manifest = fixture.cases.find(entry => entry.id === 'v2.scratch-local-three').manifest;
    assert.equal(contract.select(manifest, 'scratch-local', 'https-file', {os: 'macos', arch: 'arm64'}).os, 'macos');
    assert.throws(() => contract.select(manifest, 'scratch-local', 'https-file'), /os and arch/);
    assert.throws(() => contract.select(manifest, 'scratch-local', 'https-file', {os: 'linux'}), /os and arch/);
    assert.throws(() => contract.select(manifest, 'scratch-local', 'https-file', {
        os: 'linux', arch: 'arm64'
    }), /exactly one/);
    assert.throws(() => contract.select(manifest, 'scratch-local', 'oci', {os: 'linux', arch: 'x64'}), /kind/);
});

test('singleton selection validates the entire manifest, including unused roles', () => {
    const manifest = fixture.cases.find(entry => entry.id === 'v2.nonvariant-roles').manifest;
    assert.equal(contract.select(manifest, 'scratch', 'oci').role, 'scratch');
    assert.throws(() => contract.select(manifest, 'missing', 'oci'), /exactly one/);
    const malformed = structuredClone(manifest);
    malformed.artifacts.push({role: 'unused', kind: 'https-file', file: 'unused', sha256: 'a'.repeat(64)});
    assert.throws(() => contract.select(malformed, 'scratch', 'oci'), /schema_invalid/);
});
