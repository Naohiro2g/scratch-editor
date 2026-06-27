/**
 * Bridge configuration. TLS is terminated by Caddy in front, so the bridge
 * itself listens on plain ws on localhost (scratch-plan §2.3).
 */
export interface BridgeConfig {
  /** Interface the ws server binds to (behind Caddy). */
  wsHost: string
  /** Port the ws server binds to. */
  wsPort: number
  /** Browser Origins allowed through the WS handshake (scratch-plan §2.4). */
  originAllowlist: readonly string[]
  /**
   * Sandbox hostnames the bridge may dial. Anything not listed is refused, so
   * the bridge can't be used as an SSRF / port-scan relay.
   */
  sandboxAllowlist: readonly string[]
  /** Sandbox used when `hello` carries no `sandbox` hint. */
  defaultSandbox: string
  /** TCP port every Sandbox listens on. */
  sandboxPort: number
}

export const defaultConfig: BridgeConfig = {
  wsHost: '127.0.0.1',
  wsPort: 8080,
  originAllowlist: ['https://scratch.mc-remote.com', 'https://scratch-dev.mc-remote.com'],
  sandboxAllowlist: ['sb.mc-remote.com'],
  defaultSandbox: 'sb.mc-remote.com',
  sandboxPort: 25575,
}

/**
 * Parse a comma-separated env var into a trimmed, non-empty list.
 * @param value The raw env var value, if set.
 * @returns The parsed list, or `undefined` if unset or empty.
 */
function parseList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return items.length > 0 ? items : undefined
}

/**
 * Build a config from `defaultConfig` overlaid with environment overrides.
 * @param env The process environment to read overrides from.
 * @returns The resolved bridge configuration.
 */
export function loadConfig(env: NodeJS.ProcessEnv): BridgeConfig {
  return {
    wsHost: env.BRIDGE_WS_HOST ?? defaultConfig.wsHost,
    wsPort: env.BRIDGE_WS_PORT ? Number(env.BRIDGE_WS_PORT) : defaultConfig.wsPort,
    originAllowlist: parseList(env.BRIDGE_ORIGIN_ALLOWLIST) ?? defaultConfig.originAllowlist,
    sandboxAllowlist: parseList(env.BRIDGE_SANDBOX_ALLOWLIST) ?? defaultConfig.sandboxAllowlist,
    defaultSandbox: env.BRIDGE_DEFAULT_SANDBOX ?? defaultConfig.defaultSandbox,
    sandboxPort: env.BRIDGE_SANDBOX_PORT ? Number(env.BRIDGE_SANDBOX_PORT) : defaultConfig.sandboxPort,
  }
}
