# Agent Guide: scratch-editor

## McRemote source of truth

This fork contains McRemote-specific code and packages. Before doing work that depends on McRemote project
decisions, read the relevant documents in the GitHub repository `Naohiro2g/mc-remote-knowledge`.

This includes work affecting McRemote architecture, protocol, bridge, deployment, contributor workflow, learning
design, or behavior whose rationale depends on McRemote decisions. Typical paths include `mc-remote/*`,
`packages/scratch-vm/src/extensions/scratch3_mcremote/*`, McRemote localization, bridge configuration, and
Scratch blocks that communicate with McRemote.

First, load only the latest dev agent runtime protocol from the knowledge repository's remote `main`.
Do not print the entire source file into the conversation.

```bash
protocol_source="$(mktemp)"
knowledge_commit="$(gh api repos/Naohiro2g/mc-remote-knowledge/commits/main -q .sha)"
gh api "repos/Naohiro2g/mc-remote-knowledge/contents/00-hub/dev-repo-protocol_ja.md?ref=$knowledge_commit" \
  -q .content | base64 -d > "$protocol_source"
if [ "$(grep -Fxc '<!-- BEGIN: DEV-AGENT-RUNTIME -->' "$protocol_source")" -ne 1 ] || \
   [ "$(grep -Fxc '<!-- END: DEV-AGENT-RUNTIME -->' "$protocol_source")" -ne 1 ]; then
  echo "dev agent runtime marker missing or duplicated" >&2
  exit 1
fi
printf 'knowledge commit: %s\n' "$knowledge_commit"
awk '/^<!-- BEGIN: DEV-AGENT-RUNTIME -->$/{reading=1;next} \
     /^<!-- END: DEV-AGENT-RUNTIME -->$/{reading=0} \
     reading' "$protocol_source"
```

- Related knowledge spokes: `13-scratch-client/`, `10-protocol/`, `14-evidence/`

If `Naohiro2g/mc-remote-knowledge` is not accessible, stop and say so. Do not infer missing McRemote context from
this repository alone, assistant memory, prior conversations, or local reasoning. Do not proceed with design
decisions or implementation that depends on McRemote-specific context until SSOT access is available.

This file intentionally does not duplicate the McRemote SSOT. Duplication creates drift. Use this file as the
public entry gate; use the SSOT for McRemote decisions and the repo-specific guidance below for Scratch/editor
implementation practice.

## AI-assisted development policy

See [CONTRIBUTING.AI.md](https://github.com/scratchfoundation/.github/blob/main/CONTRIBUTING.AI.md) for Scratch's
org-wide policy on AI-assisted contributions. The short version: human developers remain responsible for all code
they submit. Do not submit code you cannot explain and defend in a review.

## Agent defaults

Use these defaults unless the user asks otherwise:

1. Keep changes minimal and scoped to the user request. Do not refactor surrounding code, add features, or clean up
   style in areas you weren't asked to touch.
2. Do not preserve backward compatibility when it isn't required. When all callers are internal to a package,
   rename or restructure freely. The `@scratch/` packages are published to npm and consumed externally, so treat
   their public exports as a contract and preserve compatibility unless explicitly told otherwise. The
   Common `@mc-remote/` packages are private and owned by `Naohiro2g/minecraft-remote-tooling`.
3. Write comments that explain the current code, not its history. Do not reference prior implementations,
   intermediate states, or what the code "used to do." If an approach seems counterintuitive, explain why it is
   correct now — not why it changed.
4. Prefer fixing root causes over adding surface-level workarounds or assertions.
5. When fixing a bug, start by adding one or more failing tests that reproduce it, then implement the fix. Iterate
   until all tests pass, including but not limited to the new tests. Use the test framework already in use in that
   package — see "Packages at a glance" below.
6. When adding runtime guards for states that should never happen, log actionable context (function name, relevant
   IDs, key flags) rather than failing silently. Use `console.warn` for recoverable states and `console.error` for
   invalid required data.
7. Preserve failure semantics when refactoring. An implicit crash (null dereference, `!` assertion) should become
   an explicit `throw` with a useful message — not silent failure. Code that previously wouldn't crash still
   shouldn't, but consider whether a warning is warranted. Replacing a potential null dereference with
   `if (!foo) return` could make a bug harder to find; `if (!foo) throw new Error(...)` surfaces it.
8. Do not add error handling, fallbacks, or validation for scenarios that cannot happen. Trust internal code and
   framework guarantees. Only validate at system boundaries (user input, external APIs).

## What this repository is

`scratch-editor` is an npm workspaces monorepo containing the packages that make up the Scratch editor. It was
assembled by migrating previously separate repositories into a single repo.

The `@scratch/` packages are published to npm. They are consumed both internally (e.g., `scratch-www` loads
`scratch-gui`) and by third parties. The common McRemote packages are owned by `Naohiro2g/minecraft-remote-tooling`; this fork consumes their fixtures and artifacts.

## Documentation entry points

- `README.md` preserves the upstream README after a bilingual fork note and Japanese local-start guide.
- `README_mc-remote.md` guides people who want to try, revisit, or develop the McRemote edition.
- `mc-remote/README.md` maps the McRemote code in this repository; common tooling package READMEs cover Protocol, Bridge and WireScope.
- `mc-remote/block-reference/README.md` covers the static Scratch block reference prototype and its image/page generator.
- `Release.md` covers the upstream npm release process and distinguishes McRemote GitHub releases.
- `SETUP_ja.md`, if present locally, is an ignored historical note. Do not use it as the current setup or deployment authority.

## Build and lint

Run workspace-wide commands from the repo root:

```sh
npm run build    # Build all packages (production)
npm run tooling:fixtures # Acquire McRemote consumer test inputs
npm test         # Test all packages
npm run clean    # Clean all packages
```

Run per-package commands from the package directory, or from the root with `--workspace`:

```sh
cd packages/scratch-vm && npm test
# or equivalently:
npm test --workspace=packages/scratch-vm
```

Each package defines its own `test` and `build` scripts; see "Packages at a glance" for specifics.

**Commit messages are enforced.** Husky + commitlint validate every commit against the
[Conventional Commits](https://www.conventionalcommits.org/) format. A commit that doesn't conform will be
rejected by the pre-commit hook.

## Repository layout

```text
packages/
├── scratch-gui/            React-based editor UI
├── scratch-vm/             Virtual machine that runs Scratch projects
├── scratch-render/         WebGL renderer for the stage
├── scratch-svg-renderer/   SVG asset processor
├── task-herder/            Async task scheduler with rate limiting
└── scratch-media-lib-scripts/  Build scripts for media library assets
mc-remote/                  Scratch-specific McRemote documentation and consumer lock
├── tooling-lock.json        Fixed common tooling commit, fixture identities and artifact digests
├── tooling/                 Ignored, verified fixture/artifact acquisition cache
├── block-reference/         Static Scratch block reference
├── local/                   Scratch Local launcher, guides and boundary tests
├── local-runtime-lock.json   Pinned official Node runtime archives
├── release-manifest-lock.json  Fixed release metadata schema and shared fixture identities
└── release-manifest/         Ignored, verified release metadata contract cache
scripts/                    Monorepo-level utility scripts
```

Protocol, common WireScope app/schema/fixtures, and Bridge live in
`Naohiro2g/minecraft-remote-tooling`, under `packages/protocol`, `packages/live` and `packages/bridge`.
Scratch keeps its VM extension, GUI observation feed and launcher. The VM keeps wire constants inline and does
not import `@mc-remote/protocol` at runtime. Tests consume fixtures acquired with `npm run tooling:fixtures`.
Do not edit the ignored acquisition cache; change the owner source and explicitly update `tooling-lock.json`.

Public Release metadata is a separate contract pinned by `mc-remote/release-manifest-lock.json`.
Run `npm run tooling:release-manifest` to acquire its v1/v2 schemas, shared fixture and reference checks,
then `npm run release-manifest:test` and `npm run release-manifest:lint`. The owner is the common tooling
repository's root `schemas/`. Public manifests use v2 with bytes for every https-file; candidate manifests
keep their own schema and kind `file`. Baseline manifests are validated in full before OCI selection.

`npm run tooling:artifacts` acquires the fixed WireScope ZIP/manifest and Bridge OCI archive. It requires
GitHub CLI authentication, `unzip` and `tar`. The McRemote release workflow builds Scratch OCI, copies the pinned
Bridge OCI preserving its digest, and collects the WireScope pair. The candidate workflow only uploads Actions
artifacts; neither workflow is permission to publish a tag or release.

`mc-remote/local/` contains the Scratch Local launcher, setup page, ZIP user guide and tests.
`mc-remote/local-runtime-lock.json` pins official Node archives for Windows x64, macOS arm64 and Linux x64.
`npm run local:build -- --os <os> --arch <arch> --commit <HEAD>` uses Python 3 to package the built GUI,
the unchanged JavaScript app extracted from the pinned Bridge OCI, the pinned WireScope app and detached
manifest, the Node runtime and licenses/source. The launcher serves Scratch on loopback port 8601 and
WireScope on a distinct loopback origin at port 8603, with Bridge on port 8602. Its runtime config supplies
`wirescope_url`; tests verify the packaged WireScope assets and all three ports closing on exit.
Runtime downloads in `mc-remote/local-inputs/` and outputs in `candidate/` are ignored. `npm run local:test`
runs Node boundary tests and Python archive tests. Release workflows collect the explicitly frozen candidate
ZIPs without rebuilding them; see `mc-remote/local/README.md` for the artifact ID/digest inputs. These local
artifacts and tests do not authorize publishing or replace the required three-OS validation.

## Packages at a glance

| Package | Language | Bundler | Tests |
| - | - | - | - |
| `scratch-gui` | JavaScript / JSX (some TypeScript) | webpack | Jest |
| `scratch-vm` | JavaScript | webpack | Tap |
| `scratch-render` | JavaScript | webpack | Tap |
| `scratch-svg-renderer` | JavaScript | webpack | Tap |
| `task-herder` | TypeScript | Vite | Vitest |
| `scratch-media-lib-scripts` | JavaScript | — | Jest |

`task-herder` represents the target stack for new packages (TypeScript + Vite + Vitest). The other packages
reflect the legacy stack and are being migrated incrementally.

## Technology conventions by package

**For existing packages**: follow the conventions already in use in that package — language, bundler, test
framework, and style. Do not introduce TypeScript into a JavaScript package, or Vitest into a Jest package,
unless that migration is the explicit goal of the task.

**For new packages**: follow the org defaults — TypeScript, Vite, Vitest, `eslint-config-scratch`.

All packages use ESLint 9 flat config (`eslint.config.mjs`) with `eslint-config-scratch`. If a package also uses
Prettier (currently `task-herder`), run `npm run format` in addition to lint.

### scratch-gui specifics

- React functional components with hooks for new code; class components exist in older code.
- Keep components presentational where possible; connect to Redux only in container files.
- Use `react-intl` / `FormattedMessage` for all user-visible strings. Do not hardcode English in JSX.
- After adding or changing messages, run `npm run i18n:src` to update the translation source file.
- Integration tests (`test/integration/`) require a browser environment via Jest + jsdom; they are slow and
  should not be run unnecessarily. Smoke tests (`test/smoke/`) require a live server.

### scratch-vm specifics

- Extension entry points live in `src/extensions/`. Each extension exports a class with `getInfo()` and block
  implementation methods.
- i18n strings in extensions are extracted with `format-message`. Run `npm run i18n:src` after changing them.

## npm workflow

Use `npm ci` from the repo root to install all workspace dependencies from `package-lock.json`.

When adding or updating a dependency in a specific package:

```sh
npm install some-package@version --workspace=packages/scratch-vm
```

This updates both `package.json` in the target package and the root `package-lock.json`.

Keep each section of a package's `package.json` (`dependencies`, `devDependencies`, `scripts`) in alphabetical
order. The same applies to the root `package.json`.

**Do not publish packages manually.** Every package has a `prepublishOnly` script that will error if you try.
Publishing is handled exclusively by the CI release pipeline.

## Before submitting changes

Review all changes and confirm:

- **Scope**: Changes are confined to the user request; nothing extra was added or modified.
- **Correctness**: Logic is sound and edge cases were considered.
- **Comments**: Comments are necessary, short, and clear; self-explanatory code has none.
- **Simplicity**: Implementation is as simple as possible; no speculative abstractions remain.
- **Documentation**: Update `AGENTS.md` and any other documentation files whose content is affected by the change
  (commands, repo structure, conventions, etc.). The "Packages at a glance" table is particularly prone to going
  stale when a package migrates its tooling.
- **Commit format**: Commit message follows Conventional Commits — the husky hook will reject it otherwise.
- **Build passes**: `npm run build` (or `npm run build` in the affected package) completes successfully.
- **Tests pass**: `npm test` (or `npm test` in the affected package) completes with no failures.
- **No lint errors**: `npm run test:lint` (or `npm run lint`) passes in the affected package.
