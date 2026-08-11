import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { afterEach, describe, expect, test } from 'vitest'
import {
  ARCHIVE_FILENAME,
  ARTIFACT_DELIVERY_FILENAMES,
  assertSourceCheckout,
  buildWireScopeArtifact,
  MANIFEST_FILENAME,
} from '../scripts/artifact.mjs'
import { HANDOFF_PROTOCOL_VERSION } from '../src/handoff'
import { OBSERVER_SCHEMA, OBSERVER_SCHEMA_VERSION } from '../src/observer'
import { OBSERVER_SESSION_PROTOCOL_VERSION } from '../src/session'
import { STATION_ATTACH_PROTOCOL_VERSION } from '../src/station'

const temporaryDirectories: string[] = []
const sha256 = (value: Buffer): string => createHash('sha256').update(value).digest('hex')

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'wirescope-artifact-test-'))
  temporaryDirectories.push(root)
  const distDirectory = join(root, 'dist')
  const assetsDirectory = join(distDirectory, 'assets')
  mkdirSync(assetsDirectory, { recursive: true })
  writeFileSync(join(distDirectory, 'index.html'), '<script src="/assets/app.js"></script>\n')
  writeFileSync(join(assetsDirectory, 'app.js'), 'console.log("WireScope")\n')
  writeFileSync(join(assetsDirectory, 'app.css'), ':root { color: green; }\n')
  const licensePath = join(root, 'LICENSE')
  const noticePath = join(root, 'NOTICE')
  const packageJsonPath = join(root, 'package.json')
  const packageLockPath = join(root, 'package-lock.json')
  writeFileSync(licensePath, 'GNU AFFERO GENERAL PUBLIC LICENSE Version 3\n')
  writeFileSync(noticePath, 'WireScope component notice\n')
  writeFileSync(
    packageJsonPath,
    `${JSON.stringify({
      license: 'AGPL-3.0-only',
      devDependencies: {
        jszip: '3.10.1',
        typescript: '5.9.3',
        vite: 'npm:rolldown-vite@7.3.1',
      },
    })}\n`,
  )
  writeFileSync(packageLockPath, '{"lockfileVersion":3}\n')
  return {
    distDirectory,
    licensePath,
    noticePath,
    packageJsonPath,
    packageLockPath,
    sourceCommit: 'a'.repeat(40),
    nodeVersion: '22.20.0',
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('detached WireScope app artifact', () => {
  test('reproduces identical archive and manifest bytes from identical inputs', async () => {
    const inputs = fixture()
    const first = await buildWireScopeArtifact({
      ...inputs,
      outputDirectory: join(inputs.distDirectory, 'artifact-a'),
    })
    const second = await buildWireScopeArtifact({
      ...inputs,
      outputDirectory: join(inputs.distDirectory, 'artifact-b'),
    })

    expect(readFileSync(first.archivePath)).toEqual(readFileSync(second.archivePath))
    expect(readFileSync(first.manifestPath)).toEqual(readFileSync(second.manifestPath))
    expect(first.archiveSha256).toBe(sha256(readFileSync(first.archivePath)))
    expect(first.manifestSha256).toBe(sha256(readFileSync(first.manifestPath)))
  })

  test('delivers exactly the detached archive and manifest under canonical filenames', async () => {
    const inputs = fixture()
    const outputDirectory = join(inputs.distDirectory, 'artifact')

    await buildWireScopeArtifact({ ...inputs, outputDirectory })

    expect(readdirSync(outputDirectory).sort()).toEqual([...ARTIFACT_DELIVERY_FILENAMES].sort())
  })

  test('keeps the manifest detached and inventories every archived asset', async () => {
    const inputs = fixture()
    const result = await buildWireScopeArtifact({
      ...inputs,
      outputDirectory: join(inputs.distDirectory, 'artifact'),
    })
    const zip = await JSZip.loadAsync(readFileSync(result.archivePath))
    const archivedPaths = Object.keys(zip.files).sort()

    expect(archivedPaths).toEqual(['LICENSE', 'NOTICE', 'assets/app.css', 'assets/app.js', 'index.html'])
    expect(archivedPaths).not.toContain(MANIFEST_FILENAME)
    expect(result.manifest.assets.map((asset) => asset.path)).toEqual(archivedPaths)
    for (const asset of result.manifest.assets) {
      const contents = await zip.file(asset.path)?.async('nodebuffer')
      expect(contents).toBeDefined()
      expect(asset.bytes).toBe(contents?.byteLength)
      expect(asset.sha256).toBe(sha256(contents ?? Buffer.alloc(0)))
    }
    expect(await zip.file('LICENSE')?.async('string')).toBe(readFileSync(inputs.licensePath, 'utf8'))
    expect(await zip.file('NOTICE')?.async('string')).toBe(readFileSync(inputs.noticePath, 'utf8'))
    expect(result.archivePath.endsWith(ARCHIVE_FILENAME)).toBe(true)
    expect(result.manifestPath.endsWith(MANIFEST_FILENAME)).toBe(true)
  })

  test('records source, build, protocol, and license identity without runtime data', async () => {
    const inputs = fixture()
    const result = await buildWireScopeArtifact({
      ...inputs,
      outputDirectory: join(inputs.distDirectory, 'artifact'),
    })

    expect(result.manifest).toMatchObject({
      manifest_schema: 'mcremote.wirescope.app-manifest',
      manifest_version: 1,
      archive: {
        file: ARCHIVE_FILENAME,
        format: 'zip',
        format_version: 1,
        sha256: result.archiveSha256,
      },
      source: {
        repository: 'https://github.com/Naohiro2g/scratch-editor',
        commit: inputs.sourceCommit,
        subdirectory: 'mc-remote/live',
        corresponding_source_url: `https://github.com/Naohiro2g/scratch-editor/tree/${inputs.sourceCommit}/mc-remote/live`,
      },
      protocols: {
        observer_schema: { name: OBSERVER_SCHEMA, version: OBSERVER_SCHEMA_VERSION },
        observer_session: OBSERVER_SESSION_PROTOCOL_VERSION,
        scratch_handoff: HANDOFF_PROTOCOL_VERSION,
        station_attach: STATION_ATTACH_PROTOCOL_VERSION,
      },
      license_expression: 'AGPL-3.0-only',
    })
    expect(result.manifest.build.toolchain).toMatchObject({
      node: inputs.nodeVersion,
      jszip: '3.10.1',
      typescript: '5.9.3',
      'rolldown-vite': '7.3.1',
    })
    const serialized = JSON.stringify(result.manifest)
    expect(serialized).not.toContain('attach_code')
    expect(serialized).not.toContain('127.0.0.1')
    expect(serialized).not.toContain('localhost')
  })

  test('rejects a source identity that is not a full commit SHA', async () => {
    const inputs = fixture()

    await expect(
      buildWireScopeArtifact({
        ...inputs,
        sourceCommit: 'main',
        outputDirectory: join(inputs.distDirectory, 'artifact'),
      }),
    ).rejects.toThrow('sourceCommit must be a full 40-character Git commit SHA')
  })

  test('allows only a matching clean checkout to claim a source commit', () => {
    const sourceCommit = 'a'.repeat(40)

    expect(() => assertSourceCheckout({ sourceCommit, head: `${sourceCommit}\n`, status: '' })).not.toThrow()
    expect(() => assertSourceCheckout({ sourceCommit, head: `${'b'.repeat(40)}\n`, status: '' })).toThrow(
      'does not match checkout HEAD',
    )
    expect(() =>
      assertSourceCheckout({ sourceCommit, head: sourceCommit, status: ' M mc-remote/live/src/main.ts\n' }),
    ).toThrow('relevant source tree is dirty')
  })
})
