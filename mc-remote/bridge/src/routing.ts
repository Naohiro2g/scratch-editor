/**
 * Read the Sandbox routing hint from the WSS connection URL
 * (wire-format-design §2). Routing is transport/session metadata: the bridge
 * validates it against the allowlist, keeps it as route context for the WSS
 * session, and forwards JSON-RPC payloads untouched.
 * @param requestUrl The URL path from the WS upgrade request.
 * @returns The requested sandbox name, or `undefined` if absent or malformed.
 */
export function parseSandboxQuery(requestUrl: string | undefined): string | undefined {
  if (requestUrl === undefined) return undefined
  try {
    const url = new URL(requestUrl, 'ws://bridge.local')
    const sandbox = url.searchParams.get('sandbox')
    return sandbox === null || sandbox.length === 0 ? undefined : sandbox
  } catch {
    return undefined
  }
}
