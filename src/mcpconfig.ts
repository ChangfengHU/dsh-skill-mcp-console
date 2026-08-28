/**
 * Translating between the universal `mcpServers` document and dsh's cordis
 * patch layer.
 *
 * dsh stores one loader entry per MCP server; Cursor, Claude Desktop, and
 * every MCP README in circulation write a single `mcpServers` object. That
 * gap is why configuring a server here means hand-translating a snippet
 * someone else already wrote — and hand-translating it into a patch list
 * whose semantics bite: a bare `- id: x` is a patch against an EXISTING
 * entry, and one that matches nothing is skipped in silence while the
 * profile still loads happily. New entries have to go inside `insert:`.
 *
 * So this module owns the translation in both directions, and writes
 * through the `yaml` Document API rather than re-serialising — the file is
 * the user's, it is full of their comments, and every one of them survives a
 * save that only touches MCP entries.
 *
 * @module dsh-plugin-station/mcpconfig
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isMap, isSeq, parseDocument, YAMLMap, YAMLSeq, type Document } from 'yaml'

/** The one official MCP bridge. Entries naming anything else are not servers. */
export const MCP_CLIENT_MODULE = '@deepseek-ai/dsh-mcp-client'

/**
 * Cordis fiber states, as words.
 *
 * The raw value is a number, and a chip reading "2" tells nobody anything.
 */
const FIBER_PHASE: Record<string, string> = {
  '0': 'pending', '1': 'loading', '2': 'active', '3': 'failed', '4': 'disposed', '5': 'unloading',
}

/**
 * The fiber's phase as a word, or null while it is simply healthy.
 *
 * `active` is the state every working entry is in, so reporting it would put
 * a badge on every row that carries no information; a phase worth a glance
 * is one that is something else. Lives here, next to the other pure MCP
 * logic, so it can be tested without standing up a cordis context — it went
 * missing once in a refactor and took the whole MCP panel down with a
 * ReferenceError that no test could have caught from where it used to live.
 */
export function phaseOf(fiber: { state: unknown } | undefined | null): string | null {
  if (fiber === undefined || fiber === null) return null
  const phase = FIBER_PHASE[String(fiber.state)] ?? String(fiber.state)
  return phase === 'active' ? null : phase
}

/** Keys copied straight through in both directions. */
const PASSTHROUGH = ['headers', 'env', 'toolCallTimeoutMs', 'failOnStartupError', 'cwd'] as const

/** One server in the universal shape. */
export interface UniversalServer {
  type?: 'http' | 'stdio'
  url?: string
  command?: string
  args?: string[]
  headers?: Record<string, string>
  env?: Record<string, string>
  toolCallTimeoutMs?: number
  failOnStartupError?: boolean
  disabled?: boolean
  /** Per-tool opt-outs; dsh has no such key, so this plugin owns it. */
  disabledTools?: string[]
}

/** Load the profile patch document, or an empty sequence when absent. */
export async function loadPatch(file: string): Promise<Document> {
  let text = ''
  try {
    text = await readFile(file, 'utf8')
  } catch {
    text = '[]\n'
  }
  const doc = parseDocument(text)
  if (!isSeq(doc.contents)) doc.contents = new YAMLSeq()
  return doc
}

/** Every mcp-client entry in the document, with the seq that holds it. */
function mcpEntries(doc: Document): { node: YAMLMap; owner: YAMLSeq }[] {
  const found: { node: YAMLMap; owner: YAMLSeq }[] = []
  const scan = (seq: YAMLSeq) => {
    for (const item of seq.items) {
      if (!isMap(item)) continue
      const insert = item.get('insert', true)
      if (isSeq(insert)) { scan(insert); continue }
      if (item.get('name') === MCP_CLIENT_MODULE) found.push({ node: item, owner: seq })
    }
  }
  scan(doc.contents as YAMLSeq)
  return found
}

/** `serverName` from an entry's config, falling back to its id. */
function nameOf(node: YAMLMap): string {
  const config = node.get('config', true)
  const serverName = isMap(config) ? config.get('serverName') : undefined
  return typeof serverName === 'string' ? serverName : String(node.get('id') ?? '')
}

/**
 * Read the whole patch layer back as a universal `mcpServers` document.
 *
 * @param mask - replace credential values with a fixed mask. The panel reads
 * masked; a save reads unmasked so untouched secrets round-trip intact.
 */
export async function toUniversal(file: string, mask = true): Promise<Record<string, UniversalServer>> {
  const doc = await loadPatch(file)
  const servers: Record<string, UniversalServer> = {}
  for (const { node } of mcpEntries(doc)) {
    const config = node.get('config', true)
    const plain = isMap(config) ? (config.toJSON() as Record<string, unknown>) : {}
    const out: UniversalServer = {}
    if (typeof plain.url === 'string') {
      out.type = 'http'
      out.url = plain.url
    } else {
      out.type = 'stdio'
      if (plain.command !== undefined) out.command = plain.command as string
      if (plain.args !== undefined) out.args = plain.args as string[]
    }
    for (const key of PASSTHROUGH) {
      if (plain[key] === undefined) continue
      const value = plain[key]
      out[key] = (mask && (key === 'headers' || key === 'env') && value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value as object).map(k => [k, '••••••']))
        : value) as never
    }
    if (node.get('disabled') === true) out.disabled = true
    servers[nameOf(node)] = out
  }
  return servers
}

/** Build the cordis `config` map for one universal server. */
function configFor(name: string, server: UniversalServer, previous?: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = { serverName: name }
  if (server.url) {
    config.transport = 'streamable-http'
    config.url = server.url
  } else {
    if (server.command !== undefined) config.command = server.command
    if (server.args !== undefined) config.args = server.args
  }
  for (const key of PASSTHROUGH) {
    if (server[key] === undefined) continue
    let value: unknown = server[key]
    // A masked credential means "unchanged": the panel never received the
    // real value, so writing the mask back would destroy the secret.
    if ((key === 'headers' || key === 'env') && value && typeof value === 'object') {
      const previousBag = (previous?.[key] ?? {}) as Record<string, string>
      value = Object.fromEntries(Object.entries(value as Record<string, string>).map(([k, v]) =>
        [k, /^•+$/.test(v) && previousBag[k] !== undefined ? previousBag[k] : v]))
    }
    config[key] = value
  }
  return config
}

/** Timestamped copy beside the file, so any write is recoverable. */
export async function backup(file: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = join(dirname(file), `cordis.patch.yml.dps-${stamp}`)
  await copyFile(file, target).catch(() => {})
  return target
}

/**
 * Write a universal `mcpServers` document back into the patch layer.
 *
 * Existing entries are updated in place, so their comments and their
 * position survive. New ones are appended inside an `insert:` block —
 * appended as a bare item they would be read as a patch against an entry
 * that does not exist, and skipped without a word. Servers missing from the
 * document are removed.
 *
 * @returns what changed, for the panel to report.
 */
export async function fromUniversal(file: string, servers: Record<string, UniversalServer>): Promise<{ added: string[]; updated: string[]; removed: string[]; backup: string }> {
  const backupPath = await backup(file)
  const doc = await loadPatch(file)
  const existing = new Map(mcpEntries(doc).map(entry => [nameOf(entry.node), entry]))
  const added: string[] = []
  const updated: string[] = []
  const removed: string[] = []

  for (const [name, server] of Object.entries(servers)) {
    const hit = existing.get(name)
    if (hit) {
      const previousConfig = hit.node.get('config', true)
      const previous = isMap(previousConfig) ? (previousConfig.toJSON() as Record<string, unknown>) : undefined
      hit.node.set('config', doc.createNode(configFor(name, server, previous)))
      if (server.disabled) hit.node.set('disabled', true)
      else hit.node.delete('disabled')
      updated.push(name)
      existing.delete(name)
      continue
    }
    const entry: Record<string, unknown> = {
      id: `mcp-${name}`.replace(/[^A-Za-z0-9_-]/g, '-'),
      name: MCP_CLIENT_MODULE,
      config: configFor(name, server),
    }
    if (server.disabled) entry.disabled = true
    insertInto(doc, entry)
    added.push(name)
  }

  for (const [name, entry] of existing) {
    const index = entry.owner.items.indexOf(entry.node)
    if (index >= 0) entry.owner.items.splice(index, 1)
    removed.push(name)
  }

  await writeFile(file, doc.toString({ lineWidth: 0 }), 'utf8')
  return { added, updated, removed, backup: backupPath }
}

/** Append one entry inside an `insert:` block, creating one if needed. */
function insertInto(doc: Document, entry: Record<string, unknown>): void {
  const root = doc.contents as YAMLSeq
  for (const item of root.items) {
    if (!isMap(item)) continue
    const insert = item.get('insert', true)
    if (isSeq(insert)) { insert.items.push(doc.createNode(entry)); return }
  }
  root.items.push(doc.createNode({ insert: [entry] }))
}

/** Flip one server's `disabled` flag without touching anything else. */
export async function setDisabled(file: string, name: string, disabled: boolean): Promise<string> {
  const backupPath = await backup(file)
  const doc = await loadPatch(file)
  for (const { node } of mcpEntries(doc)) {
    if (nameOf(node) !== name) continue
    if (disabled) node.set('disabled', true)
    else node.delete('disabled')
    await writeFile(file, doc.toString({ lineWidth: 0 }), 'utf8')
    return backupPath
  }
  throw new Error(`no MCP entry named ${name} in the patch layer`)
}

/**
 * Switch any composition entry off or back on by its id.
 *
 * The MCP panel has its own version keyed on server name; this one is keyed
 * on the entry id, because a code plugin's entries have no other stable
 * handle — `plugin-station`, `dshmarket` and the rest are addressed the way
 * a patch layer addresses them.
 *
 * An id the patch layer does not mention yet gets an entry appended under
 * `insert:`, which is how a disable survives without the user having written
 * that entry by hand.
 *
 * @param file - the profile's patch layer.
 * @param entryId - the composition entry's id.
 * @param disabled - true to switch it off.
 * @returns the backup path written before the edit.
 */
export async function setEntryDisabled(file: string, entryId: string, disabled: boolean): Promise<string> {
  const backupPath = await backup(file)
  const doc = await loadPatch(file)

  // The patch layer is a list, and its two item shapes mean different
  // things: `- id: x` PATCHES the existing entry x, while `- insert: [...]`
  // ADDS entries. Switching off something the composition already has is a
  // patch, so a missing id is appended at the root — never under `insert:`,
  // which would try to create a second entry with the same id.
  const found = findEntry(doc.contents as YAMLSeq, entryId)
  if (found) {
    if (disabled) found.set('disabled', true)
    else found.delete('disabled')
  } else if (disabled) {
    ;(doc.contents as YAMLSeq).add(doc.createNode({ id: entryId, disabled: true }))
  } else {
    // Nothing mentions it and nothing is being switched off: already on.
    return backupPath
  }
  await writeFile(file, doc.toString({ lineWidth: 0 }), 'utf8')
  return backupPath
}

/** The map patching a given entry id, searching nested `insert:` lists too. */
function findEntry(seq: YAMLSeq, entryId: string): YAMLMap | null {
  for (const item of seq.items) {
    if (!isMap(item)) continue
    const insert = item.get('insert', true)
    if (isSeq(insert)) {
      const nested = findEntry(insert, entryId)
      if (nested) return nested
      continue
    }
    if (String(item.get('id') ?? '') === entryId) return item
  }
  return null
}

/**
 * Per-tool opt-outs.
 *
 * dsh has no seam for hiding one tool of a connected server, so this plugin
 * keeps the list itself and the panel enforces it. Useful for the tools you
 * want available but not on a hair trigger — an irreversible `delete` on a
 * credential store has no business being one token away at all times.
 */
export interface ToolPolicy { [server: string]: string[] }

/** Where per-tool opt-outs live. */
export function policyPath(home: string): string {
  return join(home, '.dsh', 'plugin-station-tools.json')
}

/** Read the per-tool opt-outs, tolerating absence and corruption. */
export async function readToolPolicy(home: string): Promise<ToolPolicy> {
  try {
    return JSON.parse(await readFile(policyPath(home), 'utf8')) as ToolPolicy
  } catch {
    return {}
  }
}

/** Write the per-tool opt-outs, creating `~/.dsh` when it is not there yet. */
export async function writeToolPolicy(home: string, policy: ToolPolicy): Promise<void> {
  await mkdir(dirname(policyPath(home)), { recursive: true })
  await writeFile(policyPath(home), JSON.stringify(policy, null, 2), 'utf8')
}
