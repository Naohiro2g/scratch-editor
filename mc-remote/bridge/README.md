# @mc-remote/bridge

A thin, transparent **wss⇄TCP proxy** that lets the browser Scratch editor reach
a McRemote Sandbox. The browser cannot open a plain `ws://` to an external host
(mixed content) and the loopback exception is narrowing, so the editor connects
over `wss://` to this bridge, which relays to the Sandbox's plain TCP port
(scratch-plan §2.1).

## What it does

- **Frame translation** — one WS message ⇔ one `\n`-terminated TCP line
  (wire-format-design §2). The JSON payload is never inspected or rewritten.
- **Origin allowlist** — only the stable / dev editor Origins complete the WS
  handshake.
- **Sandbox allowlist** — the `hello` frame names the Sandbox to dial; anything
  outside the allowlist is refused, so the bridge can't be used as an SSRF /
  port-scan relay.
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

Private — not published to npm.
