/**
 * One scoped stylesheet for both sections.
 *
 * Every rule is nested under `.smc-root` so the panel cannot leak into the
 * rest of the app, and every colour comes from the host's own CSS custom
 * properties with a literal fallback — the app themes itself and the panel
 * has no business deciding what "background" means, but it must still render
 * if a variable is renamed.
 *
 * @module dsh-skill-mcp-console/client/styles
 */

const STYLE_ID = 'dsh-skill-mcp-console-styles'

const CSS = `
.smc-root { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.smc-head { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.smc-head h3 { margin: 0 0 4px; font-size: 17px; font-weight: 600; }
.smc-head p { margin: 0; font-size: 13px; opacity: .72; max-width: 60ch; line-height: 1.6; }
.smc-spacer { margin-left: auto; }

.smc-switch { display: inline-flex; gap: 2px; padding: 2px; border-radius: 7px;
  border: 1px solid var(--border-color, rgba(128,128,128,.28)); }
.smc-switch button { border: 0; background: transparent; font: inherit; font-size: 12.5px;
  padding: 4px 12px; border-radius: 5px; cursor: pointer; color: inherit; opacity: .68; }
.smc-switch button[aria-selected="true"] { background: var(--fill-secondary, rgba(128,128,128,.16)); opacity: 1; font-weight: 500; }
.smc-switch button:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: 1px; }

.smc-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; opacity: .78; }
.smc-input { flex: 1; min-width: 160px; font: inherit; font-size: 13px; padding: 6px 10px;
  border-radius: 6px; color: inherit; background: var(--fill-secondary, rgba(128,128,128,.1));
  border: 1px solid var(--border-color, rgba(128,128,128,.28)); }
.smc-btn { font: inherit; font-size: 12.5px; padding: 5px 12px; border-radius: 6px; cursor: pointer;
  color: inherit; background: transparent; border: 1px solid var(--border-color, rgba(128,128,128,.32)); }
.smc-btn:hover { background: var(--fill-secondary, rgba(128,128,128,.14)); }
.smc-btn:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: 1px; }

.smc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.smc-table th { text-align: left; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase;
  opacity: .55; font-weight: 500; padding: 0 10px 8px;
  border-bottom: 1px solid var(--border-color, rgba(128,128,128,.24)); }
.smc-table td { padding: 9px 10px; border-bottom: 1px solid var(--border-color, rgba(128,128,128,.16)); vertical-align: top; }
.smc-table tr.smc-click { cursor: pointer; }
.smc-table tr.smc-click:hover td { background: var(--fill-secondary, rgba(128,128,128,.1)); }
.smc-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 500; }
.smc-desc { font-size: 11.5px; opacity: .6; margin-top: 2px; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.smc-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; opacity: .68; white-space: nowrap; }

.smc-chip { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; letter-spacing: .04em; padding: 2px 7px; border-radius: 20px; white-space: nowrap;
  border: 1px solid var(--border-color, rgba(128,128,128,.32)); }
.smc-chip.smc-warn { color: #b07908; border-color: rgba(176,121,8,.45); background: rgba(176,121,8,.1); }
.smc-chip.smc-off { opacity: .55; }
.smc-chip.smc-ok { color: #0f8a57; border-color: rgba(15,138,87,.4); background: rgba(15,138,87,.1); }

.smc-problem { font-size: 11.5px; color: #b07908; margin-top: 4px; line-height: 1.5; }

.smc-card { border: 1px solid var(--border-color, rgba(128,128,128,.24)); border-radius: 9px; overflow: hidden; }
.smc-card + .smc-card { margin-top: 8px; }
.smc-row { display: flex; align-items: center; gap: 11px; padding: 11px 13px; }
.smc-row .smc-grow { flex: 1; min-width: 0; }
.smc-tools { border-top: 1px solid var(--border-color, rgba(128,128,128,.18)); }
.smc-tool { display: flex; gap: 10px; align-items: baseline; padding: 6px 13px 6px 34px; font-size: 12px; }
.smc-tool code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; flex: none; }
.smc-tool span { opacity: .55; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.smc-caret { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 2px 4px;
  font-family: ui-monospace, monospace; font-size: 10px; opacity: .6; flex: none; }
.smc-caret:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: 1px; border-radius: 3px; }

.smc-detail { display: grid; grid-template-columns: 200px 1fr; gap: 14px; min-height: 300px; }
@media (max-width: 680px) { .smc-detail { grid-template-columns: 1fr; } }
.smc-tree { border: 1px solid var(--border-color, rgba(128,128,128,.24)); border-radius: 8px; padding: 8px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; overflow: auto; max-height: 460px; }
.smc-tree button { display: block; width: 100%; text-align: left; border: 0; background: transparent;
  color: inherit; font: inherit; padding: 4px 8px; border-radius: 5px; cursor: pointer; opacity: .72;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.smc-tree button[aria-current="true"] { background: var(--fill-secondary, rgba(128,128,128,.16)); opacity: 1; font-weight: 500; }
.smc-tree button:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: -1px; }

.smc-pane { border: 1px solid var(--border-color, rgba(128,128,128,.24)); border-radius: 8px;
  display: flex; flex-direction: column; overflow: hidden; }
.smc-pane-bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .7;
  border-bottom: 1px solid var(--border-color, rgba(128,128,128,.18)); }
.smc-pre { margin: 0; padding: 13px 15px; overflow: auto; max-height: 460px; font-size: 12px; line-height: 1.65;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }
.smc-err { padding: 11px 13px; border-radius: 8px; font-size: 12.5px; line-height: 1.6;
  color: #c13b3b; border: 1px solid rgba(193,59,59,.35); background: rgba(193,59,59,.08); }
.smc-empty { padding: 26px 14px; text-align: center; font-size: 13px; opacity: .6; }
`

/** Install the stylesheet once; returns the disposer `ctx.effect` expects. */
export function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const existing = document.getElementById(STYLE_ID)
  if (existing) return () => {}
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.append(el)
  return () => el.remove()
}
