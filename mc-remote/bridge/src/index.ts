/**
 * `@mc-remote/bridge` — a thin, transparent wss⇄TCP proxy that lets the browser
 * Scratch editor reach a McRemote Sandbox without mixed-content / loopback
 * restrictions (scratch-plan §2.1). It frames-translates, handles the
 * Bridge-only one-shot transport hint, and enforces the Origin and Sandbox
 * allowlists without parsing JSON-RPC semantics.
 */
export { createBridge } from './server.ts'
export { loadConfig, defaultConfig, type BridgeConfig } from './config.ts'
export { isOriginAllowed, resolveSandbox, type SandboxTarget } from './allowlist.ts'
export { createLineDecoder, frameLine } from './framing.ts'
export { parseSandboxQuery } from './routing.ts'
