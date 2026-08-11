import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import JSZip from 'jszip'

export const ARCHIVE_FILENAME = 'wirescope-app.zip'
export const MANIFEST_FILENAME = 'wirescope-app.manifest.json'

const FIXED_ZIP_DATE = new Date('1980-01-01T00:00:00.000Z')
const SOURCE_REPOSITORY = 'https://github.com/Naohiro2g/scratch-editor'
const SOURCE_SUBDIRECTORY = 'mc-remote/live'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const comparePaths = (left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))

const readJson = (path, context) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`${context} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const dependencyVersion = (packageJson, name) => {
  const value = packageJson.devDependencies?.[name]
  if (typeof value !== 'string') throw new Error(`package.json must pin devDependency ${name}`)
  if (name !== 'vite') return value
  const match = /^npm:rolldown-vite@(.+)$/.exec(value)
  if (!match) throw new Error('package.json must pin vite to npm:rolldown-vite@<version>')
  return match[1]
}

const collectFiles = (directory) => {
  const files = []
  const visit = (currentDirectory) => {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true }).sort((a, b) =>
      comparePaths(a.name, b.name),
    )) {
      const path = join(currentDirectory, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`artifact input must not be a symbolic link: ${path}`)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(path)
      else throw new Error(`artifact input must be a regular file: ${path}`)
    }
  }
  visit(directory)
  return files
}

const archivePath = (root, path) => relative(root, path).split(sep).join('/')

const collectAssets = ({ distDirectory, licensePath, noticePath }) => {
  const indexPath = join(distDirectory, 'index.html')
  const assetsDirectory = join(distDirectory, 'assets')
  if (!statSync(indexPath).isFile()) throw new Error('dist/index.html must be a regular file')
  if (!statSync(assetsDirectory).isDirectory()) throw new Error('dist/assets must be a directory')
  const assetFiles = collectFiles(assetsDirectory)
  if (assetFiles.length === 0) throw new Error('dist/assets must contain at least one browser asset')
  const inputs = [
    { path: 'index.html', sourcePath: indexPath },
    ...assetFiles.map((sourcePath) => ({ path: archivePath(distDirectory, sourcePath), sourcePath })),
    { path: 'LICENSE', sourcePath: licensePath },
    { path: 'NOTICE', sourcePath: noticePath },
  ]
  return inputs
    .map(({ path, sourcePath }) => {
      const contents = readFileSync(sourcePath)
      return {
        path,
        contents,
        bytes: contents.byteLength,
        sha256: sha256(contents),
      }
    })
    .sort((a, b) => comparePaths(a.path, b.path))
}

const manifestBytes = (manifest) => Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

export const assertSourceCheckout = ({ sourceCommit, head, status }) => {
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    throw new Error('sourceCommit must be a full 40-character Git commit SHA')
  }
  if (head.trim().toLowerCase() !== sourceCommit.toLowerCase()) {
    throw new Error(`source commit ${sourceCommit} does not match checkout HEAD ${head.trim()}`)
  }
  if (status.trim()) {
    throw new Error('relevant source tree is dirty; commit the artifact inputs before building')
  }
}

export const buildWireScopeArtifact = async (options) => {
  if (!/^[0-9a-f]{40}$/i.test(options.sourceCommit)) {
    throw new Error('sourceCommit must be a full 40-character Git commit SHA')
  }
  const sourceCommit = options.sourceCommit.toLowerCase()
  const packageJsonBytes = readFileSync(options.packageJsonPath)
  const packageLockBytes = readFileSync(options.packageLockPath)
  const packageJson = readJson(options.packageJsonPath, 'package.json')
  if (packageJson.license !== 'AGPL-3.0-only') {
    throw new Error('package.json license must be AGPL-3.0-only')
  }
  const assets = collectAssets(options)
  const zip = new JSZip()
  for (const asset of assets) {
    zip.file(asset.path, asset.contents, {
      binary: true,
      createFolders: false,
      date: FIXED_ZIP_DATE,
      unixPermissions: 0o100644,
    })
  }
  const archiveBytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'UNIX',
    streamFiles: false,
  })
  const archiveSha256 = sha256(archiveBytes)
  const correspondingSourceUrl = `${SOURCE_REPOSITORY}/tree/${sourceCommit}/${SOURCE_SUBDIRECTORY}`
  const manifest = {
    manifest_schema: 'mcremote.wirescope.app-manifest',
    manifest_version: 1,
    archive: {
      file: ARCHIVE_FILENAME,
      format: 'zip',
      format_version: 1,
      sha256: archiveSha256,
    },
    source: {
      repository: SOURCE_REPOSITORY,
      commit: sourceCommit,
      subdirectory: SOURCE_SUBDIRECTORY,
      corresponding_source_url: correspondingSourceUrl,
    },
    build: {
      recipe: `npm ci && npm run build:artifact --workspace=@mc-remote/live -- --source-commit ${sourceCommit}`,
      toolchain: {
        node: options.nodeVersion ?? process.versions.node,
        'rolldown-vite': dependencyVersion(packageJson, 'vite'),
        typescript: dependencyVersion(packageJson, 'typescript'),
        jszip: dependencyVersion(packageJson, 'jszip'),
      },
      input_identity: {
        source_commit: sourceCommit,
        package_json_sha256: sha256(packageJsonBytes),
        package_lock_sha256: sha256(packageLockBytes),
      },
    },
    protocols: {
      observer_schema: { name: 'mcremote.observer', version: 1 },
      observer_session: 1,
      scratch_handoff: 1,
      station_attach: 1,
    },
    assets: assets.map(({ path, bytes, sha256: assetSha256 }) => ({
      path,
      bytes,
      sha256: assetSha256,
    })),
    license_expression: 'AGPL-3.0-only',
  }
  const serializedManifest = manifestBytes(manifest)
  const manifestSha256 = sha256(serializedManifest)
  mkdirSync(options.outputDirectory, { recursive: true })
  const outputArchivePath = join(options.outputDirectory, ARCHIVE_FILENAME)
  const outputManifestPath = join(options.outputDirectory, MANIFEST_FILENAME)
  writeFileSync(outputArchivePath, archiveBytes)
  writeFileSync(outputManifestPath, serializedManifest)
  return {
    archivePath: outputArchivePath,
    manifestPath: outputManifestPath,
    archiveSha256,
    manifestSha256,
    manifest,
  }
}
