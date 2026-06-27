/**
 * `@mc-remote/bridge` — a thin, transparent wss⇄TCP proxy that lets the browser
 * Scratch editor reach a McRemote Sandbox without mixed-content / loopback
 * restrictions (scratch-plan §2.1). It frames-translates and enforces the
 * Origin and Sandbox allowlists; it does not parse protocol semantics.
 */
export { createBridge } from './server.ts'
export { loadConfig, defaultConfig, type BridgeConfig } from './config.ts'
export { isOriginAllowed, resolveSandbox, type SandboxTarget } from './allowlist.ts'
export { createLineDecoder, frameLine } from './framing.ts'
export { peekSandbox } from './routing.ts'
