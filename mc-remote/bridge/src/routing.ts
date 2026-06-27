import { Method } from '@mc-remote/protocol'

/**
 * Read the `sandbox` routing hint from the opening `hello` message
 * (wire-format-design §6.1, scratch-plan §2.4). This is the one field the
 * bridge peeks to decide which Sandbox to dial — transport routing, not
 * protocol or auth semantics. The original message bytes are forwarded
 * untouched; this only parses a copy and only looks at the `hello` frame.
 * @param message The opening WS message (expected to be `hello`).
 * @returns The requested sandbox name, or `undefined` if absent or unparseable.
 */
export function peekSandbox(message: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(message)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  if ((parsed as { method?: unknown }).method !== Method.hello) return undefined
  const params = (parsed as { params?: unknown }).params
  if (typeof params !== 'object' || params === null) return undefined
  const sandbox = (params as { sandbox?: unknown }).sandbox
  return typeof sandbox === 'string' ? sandbox : undefined
}
