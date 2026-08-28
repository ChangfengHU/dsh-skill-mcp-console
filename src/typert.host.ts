/**
 * Host Typert manifest, exported as `./typert` so the harness's typert-loader
 * registers the `skillMcp` invocations when this plugin mounts. Same
 * invocation list the client Remote contribution carries, so the two faces
 * cannot drift.
 *
 * @module dsh-skill-mcp/typert
 */

import { CONSOLE_INVOCATIONS, PKG } from './wire.ts'

/** Host Typert manifest (validated by `@deepseek-ai/dsh-typert-loader`). */
export const TYPERT = Object.freeze({
  package: PKG,
  face: 'host',
  schemas: Object.freeze([]),
  invocations: CONSOLE_INVOCATIONS,
  model: Object.freeze({
    services: Object.freeze([]),
    events: Object.freeze([]),
    objects: Object.freeze([]),
  }),
})
