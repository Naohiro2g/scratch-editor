import type { BridgeConfig } from './config.ts'

/**
 * Whether a browser Origin may complete the WS handshake.
 * @param origin The `Origin` header from the WS handshake.
 * @param allowlist The Origins permitted to connect.
 * @returns `true` if the Origin is present and listed.
 */
export function isOriginAllowed(origin: string | undefined, allowlist: readonly string[]): boolean {
  return origin !== undefined && allowlist.includes(origin)
}

/** A resolved Sandbox TCP target. */
export interface SandboxTarget {
  host: string
  port: number
}

/**
 * Resolve the Sandbox a connection asked for to a TCP target, applying the
 * allowlist (scratch-plan §2.4). A missing hint falls back to the default
 * Sandbox; a name outside the allowlist is refused.
 * @param requested The sandbox named in `hello`, if any.
 * @param config The bridge configuration (allowlist, default, port).
 * @returns The TCP target, or `null` if the requested Sandbox is not allowed.
 */
export function resolveSandbox(requested: string | undefined, config: BridgeConfig): SandboxTarget | null {
  const sandbox = requested ?? config.defaultSandbox
  if (!config.sandboxAllowlist.includes(sandbox)) return null
  return { host: sandbox, port: config.sandboxPort }
}
