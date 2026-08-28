/**
 * The client Remote contribution for the `skillMcp` namespace. The
 * descriptor list is the same frozen literal the host TYPERT manifest
 * registers, imported rather than restated so the faces cannot drift.
 *
 * @module dsh-skill-mcp/client/remote
 */

import { CONSOLE_INVOCATIONS, PKG } from '../wire.ts'

/** Mounted through `ctx.remote.$mount` in the client plugin body. */
export const CONSOLE_REMOTE = Object.freeze({
  package: PKG,
  descriptors: CONSOLE_INVOCATIONS,
})

/** Unwrap a `RemoteResult`, turning a transport error into a thrown one. */
export function unwrap<T>(result: { ok: boolean; value?: T; error?: { code: string; message: string } }, method: string): T {
  if (!result.ok) throw new Error(`skillMcp.${method}: ${result.error?.code}: ${result.error?.message}`)
  return result.value as T
}
