export interface ArtifactAsset {
  path: string
  bytes: number
  sha256: string
}

export interface WireScopeArtifactManifest {
  manifest_schema: 'mcremote.wirescope.app-manifest'
  manifest_version: 1
  archive: {
    file: 'wirescope-app.zip'
    format: 'zip'
    format_version: 1
    sha256: string
  }
  source: {
    repository: 'https://github.com/Naohiro2g/scratch-editor'
    commit: string
    subdirectory: 'mc-remote/live'
    corresponding_source_url: string
  }
  build: {
    recipe: string
    toolchain: Record<string, string>
    input_identity: Record<string, string>
  }
  protocols: {
    observer_schema: { name: 'mcremote.observer'; version: 1 }
    observer_session: 1
    scratch_handoff: 1
    station_attach: 1
  }
  assets: ArtifactAsset[]
  license_expression: 'AGPL-3.0-only'
}

export interface BuildWireScopeArtifactOptions {
  distDirectory: string
  outputDirectory: string
  licensePath: string
  noticePath: string
  packageJsonPath: string
  packageLockPath: string
  sourceCommit: string
  nodeVersion?: string
}

export interface BuildWireScopeArtifactResult {
  archivePath: string
  manifestPath: string
  archiveSha256: string
  manifestSha256: string
  manifest: WireScopeArtifactManifest
}

export const ARCHIVE_FILENAME: 'wirescope-app.zip'
export const MANIFEST_FILENAME: 'wirescope-app.manifest.json'

export function assertSourceCheckout(options: { sourceCommit: string; head: string; status: string }): void

export function buildWireScopeArtifact(options: BuildWireScopeArtifactOptions): Promise<BuildWireScopeArtifactResult>
