/**
 * Frame translation between the two transports the bridge straddles
 * (wire-format-design §2):
 *
 * - browser link: one JSON-RPC value per WS message
 * - direct TCP link: one JSON-RPC value per `\n`-terminated line
 *
 * The JSON payload itself is never inspected or rewritten here.
 */

/**
 * Frame one WS message as a `\n`-terminated TCP line.
 * @param message The WS message payload, forwarded untouched.
 * @returns The payload with a single trailing newline.
 */
export function frameLine(message: string): string {
  return `${message}\n`
}

/**
 * Build a decoder that turns a newline-delimited TCP byte stream into complete
 * lines, holding back a trailing partial line until the rest of it arrives in a
 * later chunk. Empty lines are dropped.
 * @returns A function that decodes each TCP chunk into zero or more lines.
 */
export function createLineDecoder(): (chunk: Buffer) => string[] {
  let buffer = ''
  return (chunk) => {
    buffer += chunk.toString('utf8')
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    return parts.filter((line) => line.length > 0)
  }
}
