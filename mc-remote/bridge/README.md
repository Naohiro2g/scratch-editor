# @mc-remote/bridge

A thin, transparent **wss⇄TCP proxy** that lets the browser Scratch editor reach
a McRemote Sandbox. The browser cannot open a plain `ws://` to an external host
(mixed content) and the loopback exception is narrowing, so the editor connects
over `wss://` to this bridge, which relays to the Sandbox's plain TCP port
(scratch-plan §2.1).

## What it does

- **Frame translation** — one WS message ⇔ one `\n`-terminated TCP line
  (wire-format-design §2). The JSON payload is never inspected or rewritten.
- **Origin allowlist** — only editor Origins configured for that channel
  complete the WS handshake.
- **Sandbox allowlist** — the WSS connection URL names the Sandbox to dial
  (for example, `?sandbox=sb-beta.mc-remote.com`); anything outside the allowlist
  is refused, so the bridge can't be used as an SSRF / port-scan relay.
- **Full-duplex, push-transparent** — server→client push passes straight through
  with no request/response coupling or buffering.

It does **not** parse protocol semantics or interpret auth; the McRemote plugin
remains the source of truth. TLS is terminated by Caddy in front, so the bridge
listens on plain ws on localhost.

## Run

```sh
npm run build --workspace=mc-remote/bridge   # bundle to dist/ (Node ES)
npm start     --workspace=mc-remote/bridge   # node dist/main.js
npm run dev   --workspace=mc-remote/bridge   # rebuild on change
```

Configuration is via environment variables (see `src/config.ts`):
`BRIDGE_WS_HOST`, `BRIDGE_WS_PORT`, `BRIDGE_ORIGIN_ALLOWLIST`,
`BRIDGE_SANDBOX_ALLOWLIST`, `BRIDGE_DEFAULT_SANDBOX`, `BRIDGE_SANDBOX_PORT`.

Each deployment profile must configure the same sandbox route set in the
editor's `mc-remote-runtime-config.json` `connection_targets` and the Bridge's
`BRIDGE_SANDBOX_ALLOWLIST`. `default_sandbox` and
`BRIDGE_DEFAULT_SANDBOX` must both name one of those routes. For example, a
beta editor may list stable and beta routes while its Bridge uses:

```sh
BRIDGE_ORIGIN_ALLOWLIST=https://scratch-beta.mc-remote.com
BRIDGE_SANDBOX_ALLOWLIST=sb.mc-remote.com,sb-beta.mc-remote.com
BRIDGE_DEFAULT_SANDBOX=sb-beta.mc-remote.com
```

The runtime JSON belongs to the deployment profile and can be replaced without
rebuilding the editor. Public profiles must contain only publicly reachable
DNS names; localhost and private-address routes belong only in private local
profiles. DNS or the profile may change physical hosting without changing the
channel name.

Private — not published to npm.

## OCI image

The repository workflow builds the bridge output first, then packages only
`dist/`, `package.json`, and the lock-installed production `ws` dependency. The
runtime image does not compile source and runs as the non-root `node` user.
