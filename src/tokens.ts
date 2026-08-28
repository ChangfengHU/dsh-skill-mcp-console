/**
 * Context-cost estimation.
 *
 * A skill's `description` and a tool's schema sit in the prompt on every
 * turn, so "what does keeping this cost me" is the number that decides
 * whether a rarely-used capability earns its place. dsh ships
 * `ctx.tokenMeter`, but its README states the estimator "intentionally uses
 * one fixed heuristic: four characters per token" — calibrated for English.
 * CJK text runs closer to one token per character, so a Chinese skill
 * description comes out under-counted by roughly a factor of three, and an
 * under-count is worse than no number at all: it argues for keeping things.
 *
 * This counts CJK and non-CJK separately. It is still an estimate — the real
 * figure depends on the model's tokenizer — so every surface that shows it
 * says "约" / "approx".
 *
 * @module dsh-plugin-station/tokens
 */

/** CJK ideographs, kana, Hangul, and full-width punctuation. */
const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯가-힯]/u

/**
 * Estimate the tokens one string occupies.
 *
 * CJK characters count as one token each; everything else is charged at four
 * characters per token, the ratio every mainstream BPE tokenizer lands near
 * for Latin prose and code.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  let cjk = 0
  for (const char of text) if (CJK.test(char)) cjk++
  const rest = [...text].length - cjk
  return cjk + Math.ceil(rest / 4)
}

/**
 * Estimate what one MCP tool costs in the tools array: its name, its
 * description, and its JSON Schema, all serialized into the request.
 */
export function estimateToolTokens(tool: { name: string; description?: string; parameters?: unknown }): number {
  const schema = tool.parameters === undefined ? '' : JSON.stringify(tool.parameters)
  // The wire form carries structural JSON around each field; ~8 tokens covers
  // the key names and braces one tool entry adds beyond its own text.
  return estimateTokens(tool.name) + estimateTokens(tool.description ?? '') + estimateTokens(schema) + 8
}

/** Format a token count for a compact chip: `412`, `4.2k`. */
export function formatTokens(count: number): string {
  return count < 1000 ? String(count) : `${(count / 1000).toFixed(1)}k`
}
