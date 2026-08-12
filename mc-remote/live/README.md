# @mc-remote/live

WireScope is McRemote's read-only observer web app. This package owns the shared observer schema, handoff message
types, lifecycle fixture, and browser UI used by Scratch now and by the Python adapter later.

## Local use

From the repository root:

```sh
npm run build --workspace=@mc-remote/live
npm run preview --workspace=@mc-remote/live
```

The preview server listens on `http://127.0.0.1:4173/`, matching the development
`packages/scratch-gui/static/mc-remote-runtime-config.json`. WireScope must run on an origin distinct from the
Scratch editor.

Open WireScope from the connected WireScope mini panel. Direct navigation intentionally has no observation
capability.

WireScope selects English or Japanese from the browser language preferences. The language button in the header
cycles through English, Japanese (`ja`), and Japanese Hiragana (`ja-Hira`, shown as `にほんご`) without changing or
reconnecting the observation target.

## Observer client

The browser client keeps the strict `mcremote.observer` schema version 1 validator separate from the versioned
observer session envelope. A snapshot envelope applies the sanitized snapshot and its `history_window` metadata
atomically. The session core accepts the wire end reasons `target-ended`, `source-closed`, `backpressure`, and
`capacity-exhausted`; it synthesizes `transport-lost` only as a browser-local terminal state.
The transport-neutral `test/fixtures/observer-session-lifecycle.ndjson` fixture fixes the initial serialized
envelope shape for adapter conformance.

The shared `test/fixtures/display-alias-v1.json` fixture fixes the vocabulary and `WORD-WORD-NNNNNN` shape for
source-side alias conformance. The Scratch generator is checked against it. The alias is display-only: it is not
a discovery key, target identity, attach capability, or authorization input. Observer schema v1 continues to
accept existing non-empty aliases so recorded sessions and other source implementations can migrate independently.

The current Scratch transport remains a distinct-origin `MessageChannel` adapter. An opener plus a distinct
absolute referrer makes Scratch only a candidate. The adapter must receive an exact source, origin, protocol, and
single-port attach within the 2,000 ms Scratch selection window. Once that port is accepted, the client never
falls back to another adapter. If the window expires, the client removes the Scratch listener and delegates to
the same-origin station adapter. The station adapter validates the versioned bootstrap response, accepts the
short-lived code only through an in-memory browser form, and parses the successful bounded NDJSON stream into
the same observer session core. `test/fixtures/station-attach-v1.json` fixes the initial bootstrap, attach,
bounded error, framing-limit, and response-header contract for Python conformance. The Python loopback HTTP
server and real-browser E2E remain separate follow-up slices.

## Immutable app artifact

Build the browser app archive and its detached manifest from a clean checkout whose `HEAD` is the full commit
passed on the command line:

```sh
npm run build:artifact --workspace=@mc-remote/live -- --source-commit <40-character-commit>
```

The command writes `dist/artifacts/wirescope-app.zip` and
`dist/artifacts/wirescope-app.manifest.json`. The ZIP contains only the browser `index.html`, hashed browser
assets, `LICENSE`, and `NOTICE`; the manifest is deliberately not inside the archive. It records the archive and
asset SHA-256 values, exact corresponding source, build inputs and toolchain, protocol compatibility set, and
`AGPL-3.0-only` component license. Consumers must pin and verify the SHA-256 of both detached files outside the
manifest.

### Consumer handoff unit

Scratch hands the app to another repository as exactly these two files, with their bytes and canonical filenames
unchanged:

- `wirescope-app.zip`
- `wirescope-app.manifest.json`

The pair is not wrapped in another archive and no generated lock file is added. The receiving distribution owns
the outer trust boundary: it pins both file hashes in its build input and verifies them again in its package
inventory (for a Python wheel, `RECORD`). A temporary cross-repository transfer may place the pair under
`handoff-materials/<handoff-id>/materials/` with a human-readable handoff manifest that records both hashes and
byte counts; that handoff directory is not a public artifact channel or a release identity.

GitHub Releases, npm packages, and GitHub Actions artifacts are not designated as the public distribution channel
by this handoff contract. Selecting and validating a public channel remains part of the later license and artifact
distribution gate.

## Security boundary

- The source validates the configured WireScope origin and popup window before transferring a `MessagePort`.
- A short-lived, unguessable grant crosses only that port and can be redeemed once.
- The Scratch adapter constructs observer data with a field allowlist. It never transfers `auth.*` frames,
  bearer tokens, pair codes, player UUIDs, credential identifiers or hashes, or device labels.
- Target identity, grants, sessions, aliases, and observed history remain in memory. They are not written to URL
  parameters, project data, `localStorage`, IndexedDB, or `BroadcastChannel`.
- The station adapter sends the normalized attach code only in the same-origin `POST` body with credentials
  omitted. It rejects redirects, unversioned bootstrap data, unbounded responses, and invalid NDJSON framing.

The observer contract is versioned independently as `mcremote.observer` schema version 1. Its initial shape uses
`streams[]` even though the Scratch reference adapter currently exposes one `main` stream.

The development HTML includes a restrictive CSP meta policy. Production deployment must still set the required
CSP, COOP, caching, and artifact-identity response headers; the HTML meta policy alone is not the deployment gate.
