/**
 * Code plugins — the npm packages that extend the Host itself, as opposed to
 * skills (instructions), MCP servers (tools), or the manifest kind of plugin
 * that only bundles those two.
 *
 * **Why this exists next to the Host's own Plugin list.** That list renders
 * one row per composition entry, and a composition is mostly the Host: on the
 * deployment this was written against, 153 entries, of which 3 came from a
 * package anyone installed. The other 150 are `@deepseek-ai/*` internals —
 * `include`, `timer`, `hmr`, `typert-loader` — which nobody installed, cannot
 * meaningfully remove, and which bury the three that answer the question the
 * page's own title asks. So this view inverts the default: packages you
 * installed, grouped by package, with the Host's own entries folded away.
 *
 * **Grouping by package rather than by entry.** One package can contribute
 * several entries (`dsh-mcp-client` contributes one per configured server),
 * and an entry id is not the package name, so an entry list cannot answer
 * "what did installing this give me" or "what happens if I remove it". The
 * join runs the other way: read the profile's direct dependencies, then
 * attach every composition entry whose module resolves into that package.
 *
 * **Reporting the fiber, not the toggle.** `disabled` is a statement of
 * intent; the fiber phase is what actually happened. A package that is
 * enabled and FAILED is the case worth surfacing loudest, and it is exactly
 * the case a two-state Enabled/Disabled column cannot express.
 *
 * @module dsh-plugin-station/plugins
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PackageRow, PluginEntryRow } from './wire.ts'

/** Packages published by the Host itself, which are never "yours". */
const HOST_SCOPE = '@deepseek-ai/'

/** What a package.json tells us, as far as this needs to read one. */
interface Manifest {
  name?: unknown
  version?: unknown
  description?: unknown
  dependencies?: Record<string, unknown>
  dsh?: { bundle?: unknown; client?: unknown }
}

/** Read and parse a JSON file, or null when it is missing or malformed. */
async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}

/**
 * The package a composition entry's module belongs to.
 *
 * Entry modules are package specifiers, sometimes with a subpath
 * (`dshmarket/client`) and sometimes scoped (`@deepseek-ai/dsh-web/app`).
 * Only the package part identifies the owner.
 *
 * @param module - the entry's `name`, as the loader records it.
 */
export function packageOf(module: string): string {
  const parts = module.split('/')
  if (module.startsWith('@')) return parts.slice(0, 2).join('/')
  return parts[0] ?? module
}

/**
 * Group live composition entries under the packages that contributed them.
 *
 * Both halves are passed in rather than read here: the entries come from the
 * loader, which only the service has, and the profile directory is a
 * deployment fact. Keeping this a pure function is what lets it be tested
 * without a Cordis context or a real profile on disk.
 *
 * @param profileDir - the booted profile's directory.
 * @param entries - one record per live composition entry.
 * @returns installed packages first, then a single folded row for the Host's.
 */
export async function collectPackages(
  profileDir: string,
  entries: PluginEntryRow[],
): Promise<{ installed: PackageRow[]; builtinEntries: number; builtinPackages: number }> {
  const profile = await readJson<Manifest>(join(profileDir, 'package.json'))
  const declared = Object.entries(profile?.dependencies ?? {})
    .filter(([name]) => !name.startsWith(HOST_SCOPE))

  const byPackage = new Map<string, PluginEntryRow[]>()
  for (const entry of entries) {
    const owner = packageOf(entry.module)
    const list = byPackage.get(owner) ?? []
    list.push(entry)
    byPackage.set(owner, list)
  }

  const installed: PackageRow[] = []
  for (const [name, spec] of declared) {
    const manifest = await readJson<Manifest>(join(profileDir, 'node_modules', name, 'package.json'))
    const own = byPackage.get(name) ?? []
    installed.push({
      name,
      version: typeof manifest?.version === 'string' ? manifest.version : null,
      description: typeof manifest?.description === 'string' ? manifest.description : '',
      // The dependency spec is the honest answer to "where did this come
      // from" — `github:owner/repo`, a tarball URL, `link:`, or a range.
      source: typeof spec === 'string' ? spec : '',
      // A package with no `dsh.bundle` is a plain dependency someone added,
      // not a plugin, and saying so beats rendering it as a broken one.
      bundled: Boolean(manifest?.dsh?.bundle),
      hasClient: Boolean(manifest?.dsh?.client),
      entries: own.sort((a, b) => a.id.localeCompare(b.id)),
    })
    byPackage.delete(name)
  }

  // Whatever is left came from the Host's own scope (or from a package the
  // profile does not declare directly, which is the same thing to a reader:
  // not something they chose). Counted, not listed.
  let builtinEntries = 0
  for (const list of byPackage.values()) builtinEntries += list.length

  installed.sort((a, b) => a.name.localeCompare(b.name))
  return { installed, builtinEntries, builtinPackages: byPackage.size }
}
