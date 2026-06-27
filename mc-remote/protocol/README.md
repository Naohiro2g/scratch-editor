# @mc-remote/protocol

The McRemote wire contract as TypeScript types and constants: the JSON-RPC 2.0
envelope, method names, the `hello` handshake shapes, and the error model.

This package is a **dependency-free leaf**. It mirrors the single source of
truth in the `mc-remote-knowledge` repo (`10-protocol`, the wire-format design)
so that the bridge and the live observer can share one definition of the wire.

The scratch-vm McRemote extension deliberately **does not** import this package.
It is baked into scratch-vm at build time and keeps the same constants inline;
runtime compatibility is negotiated through the `protocol` semver in `hello`, not
guaranteed by a shared import.

Private — not published to npm.
