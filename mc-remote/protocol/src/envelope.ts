/**
 * JSON-RPC 2.0 envelope (wire-format-design §3). The transport carries one JSON
 * value per frame: one WS message on the browser link, one `\n`-terminated line
 * on the direct TCP link.
 */

export const JSONRPC_VERSION = '2.0'

/** A request id correlates a request with its response. */
export type JsonRpcId = number | string

/** Positional params (the common case) or an object (only `hello`). */
export type JsonRpcParams = readonly unknown[] | Record<string, unknown>

/** Request expecting a response — `id` is present. */
export interface JsonRpcRequest {
  jsonrpc: typeof JSONRPC_VERSION
  id: JsonRpcId
  method: string
  params?: JsonRpcParams
}

/** Notification — no response, `id` omitted (wire-format-design §3.2). */
export interface JsonRpcNotification {
  jsonrpc: typeof JSONRPC_VERSION
  method: string
  params?: JsonRpcParams
}

export interface JsonRpcError<TData = unknown> {
  code: number
  message: string
  data?: TData
}

export interface JsonRpcSuccess<TResult = unknown> {
  jsonrpc: typeof JSONRPC_VERSION
  id: JsonRpcId
  result: TResult
}

export interface JsonRpcFailure<TData = unknown> {
  jsonrpc: typeof JSONRPC_VERSION
  id: JsonRpcId
  error: JsonRpcError<TData>
}

export type JsonRpcResponse<TResult = unknown, TData = unknown> = JsonRpcSuccess<TResult> | JsonRpcFailure<TData>
