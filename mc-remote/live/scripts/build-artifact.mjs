import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertSourceCheckout, buildWireScopeArtifact } from './artifact.mjs'

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryDirectory = resolve(packageDirectory, '../..')

const main = async () => {
  const argumentsAfterScript = process.argv.slice(2)
  if (argumentsAfterScript.length !== 2 || argumentsAfterScript[0] !== '--source-commit') {
    throw new Error('--source-commit <full SHA> is required')
  }
  const sourceCommit = argumentsAfterScript[1]
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryDirectory,
    encoding: 'utf8',
  })
  const status = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--', 'LICENSE', 'package-lock.json', 'mc-remote/live'],
    { cwd: repositoryDirectory, encoding: 'utf8' },
  )
  assertSourceCheckout({ sourceCommit, head, status })

  const result = await buildWireScopeArtifact({
    distDirectory: join(packageDirectory, 'dist'),
    outputDirectory: join(packageDirectory, 'dist', 'artifacts'),
    licensePath: join(repositoryDirectory, 'LICENSE'),
    noticePath: join(packageDirectory, 'NOTICE'),
    packageJsonPath: join(packageDirectory, 'package.json'),
    packageLockPath: join(repositoryDirectory, 'package-lock.json'),
    sourceCommit,
  })

  process.stdout.write(
    `${JSON.stringify(
      {
        archive: { path: result.archivePath, sha256: result.archiveSha256 },
        manifest: { path: result.manifestPath, sha256: result.manifestSha256 },
      },
      null,
      2,
    )}\n`,
  )
}

main().catch((error) => {
  process.stderr.write(`build-artifact: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
