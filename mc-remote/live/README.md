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

## Security boundary

- The source validates the configured WireScope origin and popup window before transferring a `MessagePort`.
- A short-lived, unguessable grant crosses only that port and can be redeemed once.
- The Scratch adapter constructs observer data with a field allowlist. It never transfers `auth.*` frames,
  bearer tokens, pair codes, player UUIDs, credential identifiers or hashes, or device labels.
- Target identity, grants, sessions, aliases, and observed history remain in memory. They are not written to URL
  parameters, project data, `localStorage`, IndexedDB, or `BroadcastChannel`.

The observer contract is versioned independently as `mcremote.observer` schema version 1. Its initial shape uses
`streams[]` even though the Scratch reference adapter currently exposes one `main` stream.

The development HTML includes a restrictive CSP meta policy. Production deployment must still set the required
CSP, COOP, caching, and artifact-identity response headers; the HTML meta policy alone is not the deployment gate.
