/**
 * One scoped stylesheet for both sections.
 *
 * Every rule is nested under a `smc-` prefix so the panel cannot leak into
 * the rest of the app, and every colour comes from the host's own CSS custom
 * properties with a literal fallback — the app themes itself and the panel
 * has no business deciding what "background" means, but it must still render
 * if a variable is renamed.
 *
 * @module dsh-skill-mcp-console/client/styles
 */

const STYLE_ID = 'dsh-skill-mcp-console-styles'

const CSS = `
.smc-root { display: flex; flex-direction: column; gap: 13px; min-width: 0; }
.smc-head { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
.smc-head h3 { margin: 0 0 4px; font-size: 17px; font-weight: 600; }
.smc-head p, .smc-lede { margin: 0; font-size: 13px; opacity: .72; max-width: 62ch; line-height: 1.62; }
.smc-spacer { margin-left: auto; }
.smc-hint { font-size: 11.5px; opacity: .58; line-height: 1.55; }
.smc-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; opacity: .68; }
.smc-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.smc-dim { opacity: .5; }

.smc-bar { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; font-size: 12.5px; opacity: .85; }
.smc-input, .smc-mono-input, .smc-editor, .smc-field input, .smc-field textarea {
  font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 6px; color: inherit;
  background: var(--fill-secondary, rgba(128,128,128,.1));
  border: 1px solid var(--border-color, rgba(128,128,128,.28)); }
.smc-input { flex: 1; min-width: 150px; }
.smc-mono-input, .smc-editor { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; width: 100%; }
.smc-editor { min-height: 320px; line-height: 1.7; resize: vertical; }
.smc-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.smc-field label { font-size: 12.5px; font-weight: 500; opacity: .8; }
.smc-field textarea { line-height: 1.6; resize: vertical; }
.smc-input:focus-visible, .smc-mono-input:focus-visible, .smc-editor:focus-visible,
.smc-field input:focus-visible, .smc-field textarea:focus-visible {
  outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: -1px; }

.smc-btn { font: inherit; font-size: 12.5px; padding: 5px 12px; border-radius: 6px; cursor: pointer;
  color: inherit; background: transparent; border: 1px solid var(--border-color, rgba(128,128,128,.32)); }
.smc-btn:hover:not(:disabled) { background: var(--fill-secondary, rgba(128,128,128,.14)); }
.smc-btn:disabled { opacity: .45; cursor: default; }
.smc-btn.smc-primary { background: var(--accent-color, #3a4fd8); border-color: var(--accent-color, #3a4fd8); color: #fff; }
.smc-btn:focus-visible, .smc-back:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: 1px; }
.smc-back { border: 0; background: transparent; color: inherit; font: inherit; font-size: 13px;
  opacity: .72; cursor: pointer; padding: 0; align-self: flex-start; }

.smc-switch { display: inline-flex; gap: 2px; padding: 2px; border-radius: 7px;
  border: 1px solid var(--border-color, rgba(128,128,128,.28)); }
.smc-switch button { border: 0; background: transparent; font: inherit; font-size: 12px;
  padding: 4px 11px; border-radius: 5px; cursor: pointer; color: inherit; opacity: .66; }
.smc-switch button[aria-selected="true"] { background: var(--fill-secondary, rgba(128,128,128,.18)); opacity: 1; font-weight: 500; }
.smc-switch button:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: 1px; }

.smc-menu { position: relative; }
.smc-menu-list { position: absolute; right: 0; top: calc(100% + 5px); z-index: 30; min-width: 224px; padding: 5px;
  border-radius: 8px; border: 1px solid var(--border-color, rgba(128,128,128,.3));
  background: var(--background-primary, var(--fill-primary, #fff)); box-shadow: 0 10px 30px -10px rgba(0,0,0,.45); }
.smc-menu-list button { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  border: 0; background: transparent; font: inherit; font-size: 13px; color: inherit;
  padding: 7px 9px; border-radius: 5px; cursor: pointer; }
.smc-menu-list button:hover { background: var(--fill-secondary, rgba(128,128,128,.16)); }
.smc-menu-list hr { border: 0; border-top: 1px solid var(--border-color, rgba(128,128,128,.24)); margin: 5px 2px; }
.smc-g { width: 14px; text-align: center; opacity: .55; font-family: ui-monospace, monospace; font-size: 11px; flex: none; }

.smc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.smc-table th { text-align: left; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase;
  opacity: .5; font-weight: 500; padding: 0 10px 8px;
  border-bottom: 1px solid var(--border-color, rgba(128,128,128,.24)); }
.smc-table td { padding: 9px 10px; border-bottom: 1px solid var(--border-color, rgba(128,128,128,.16)); vertical-align: top; }
.smc-table tr.smc-click { cursor: pointer; }
.smc-table tr.smc-click:hover td { background: var(--fill-secondary, rgba(128,128,128,.1)); }
.smc-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 500; }
.smc-desc { font-size: 11.5px; opacity: .6; margin-top: 2px; line-height: 1.5; max-width: 52ch;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.smc-problem { font-size: 11.5px; color: #b07908; margin-top: 4px; line-height: 1.5; max-width: 56ch; }
.smc-tok { white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.smc-tok b { font-weight: 600; font-variant-numeric: tabular-nums; font-size: 13px; }
.smc-tok span { font-size: 10.5px; opacity: .5; margin-left: 3px; }
.smc-tok em { display: block; font-style: normal; font-size: 10.5px; color: #0f8a57; margin-top: 1px; }

.smc-state { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 500;
  padding: 3px 9px; border-radius: 20px; cursor: pointer; white-space: nowrap; border: 1px solid; background: transparent; }
.smc-state:disabled { opacity: .5; cursor: default; }
.smc-state:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: 2px; }
.smc-s-on { color: #0f8a57; border-color: rgba(15,138,87,.45); background: rgba(15,138,87,.1); }
.smc-s-name { color: #b07908; border-color: rgba(176,121,8,.45); background: rgba(176,121,8,.1); }
.smc-s-user { color: #3a4fd8; border-color: rgba(58,79,216,.4); background: rgba(58,79,216,.1); }
.smc-s-off { opacity: .6; border-color: var(--border-color, rgba(128,128,128,.4)); }

.smc-legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 11.5px; opacity: .62; line-height: 1.6; }
.smc-legend i { font-style: normal; font-family: ui-monospace, monospace; font-weight: 600; margin-right: 4px; }

.smc-chip { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; padding: 2px 7px; border-radius: 20px; white-space: nowrap;
  border: 1px solid var(--border-color, rgba(128,128,128,.32)); }
.smc-chip.smc-warn { color: #b07908; border-color: rgba(176,121,8,.45); background: rgba(176,121,8,.1); }
.smc-chip.smc-ok { color: #0f8a57; border-color: rgba(15,138,87,.4); background: rgba(15,138,87,.1); }
.smc-budget { display: inline-flex; align-items: baseline; gap: 5px; font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; padding: 3px 10px; border-radius: 20px;
  border: 1px solid var(--border-color, rgba(128,128,128,.28)); }
.smc-bl { font-size: 9.5px; opacity: .55; }
.smc-budget b { font-weight: 600; font-variant-numeric: tabular-nums; }
.smc-bd { color: #0f8a57; font-size: 11px; }

.smc-card { border: 1px solid var(--border-color, rgba(128,128,128,.24)); border-radius: 9px; overflow: hidden; }
.smc-card + .smc-card { margin-top: 8px; }
.smc-card-off { border-style: dashed; opacity: .68; }
.smc-row { display: flex; align-items: center; gap: 10px; padding: 11px 13px; }
.smc-grow { flex: 1; min-width: 0; }
.smc-tools { border-top: 1px solid var(--border-color, rgba(128,128,128,.18)); }
.smc-tool { display: flex; gap: 10px; align-items: center; padding: 6px 13px 6px 34px; font-size: 12px; }
.smc-tool code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; flex: none; }
.smc-tool > span:not(.smc-ttok) { opacity: .5; font-size: 11.5px; flex: 1; }
.smc-ttok { font-family: ui-monospace, monospace; font-size: 10.5px; opacity: .5; flex: none; font-variant-numeric: tabular-nums; }
.smc-caret { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 2px 4px;
  font-family: ui-monospace, monospace; font-size: 10px; opacity: .6; flex: none; }
.smc-caret:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: 1px; border-radius: 3px; }

.smc-toggle, .smc-tool-toggle { position: relative; border-radius: 11px; flex: none; cursor: pointer; padding: 0;
  border: 1px solid var(--border-color, rgba(128,128,128,.4)); background: var(--fill-secondary, rgba(128,128,128,.16));
  transition: background .15s, border-color .15s; }
.smc-toggle { width: 36px; height: 20px; }
.smc-tool-toggle { width: 28px; height: 16px; }
.smc-toggle::after, .smc-tool-toggle::after { content: ""; position: absolute; top: 2px; left: 2px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.35); transition: transform .15s; }
.smc-toggle::after { width: 14px; height: 14px; }
.smc-tool-toggle::after { width: 10px; height: 10px; top: 2px; }
.smc-toggle[aria-pressed="true"] { background: var(--accent-color, #3a4fd8); border-color: var(--accent-color, #3a4fd8); }
.smc-toggle[aria-pressed="true"]::after { transform: translateX(16px); }
.smc-tool-toggle[aria-pressed="true"] { background: #0f8a57; border-color: #0f8a57; }
.smc-tool-toggle[aria-pressed="true"]::after { transform: translateX(12px); }
.smc-toggle:disabled, .smc-tool-toggle:disabled { opacity: .45; cursor: default; }
.smc-toggle:focus-visible, .smc-tool-toggle:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: 2px; }

.smc-detail { display: grid; grid-template-columns: 210px 1fr; gap: 13px; min-height: 300px; }
@media (max-width: 680px) { .smc-detail { grid-template-columns: 1fr; } }
.smc-tree { border: 1px solid var(--border-color, rgba(128,128,128,.24)); border-radius: 8px; padding: 8px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; overflow: auto; max-height: 440px; }
.smc-tree button { display: block; width: 100%; text-align: left; border: 0; background: transparent;
  color: inherit; font: inherit; padding: 4px 8px; border-radius: 5px; cursor: pointer; opacity: .7;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.smc-tree button[aria-current="true"] { background: var(--fill-secondary, rgba(128,128,128,.18)); opacity: 1; font-weight: 500; }
.smc-tree button:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: -1px; }

.smc-pane { border: 1px solid var(--border-color, rgba(128,128,128,.24)); border-radius: 8px;
  display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.smc-pane-bar { display: flex; align-items: center; gap: 8px; padding: 5px 10px; font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .7;
  border-bottom: 1px solid var(--border-color, rgba(128,128,128,.18)); }
.smc-seg { margin-left: auto; display: inline-flex; gap: 2px; padding: 2px; border-radius: 6px;
  border: 1px solid var(--border-color, rgba(128,128,128,.26)); }
.smc-seg button { border: 0; background: transparent; padding: 2px 7px; border-radius: 4px; cursor: pointer;
  color: inherit; font-size: 11.5px; line-height: 1.3; opacity: .6; font-family: ui-monospace, monospace; }
.smc-seg button[aria-selected="true"] { background: var(--fill-secondary, rgba(128,128,128,.2)); opacity: 1; }
.smc-seg button:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: 1px; }
.smc-pre { margin: 0; padding: 13px 15px; overflow: auto; max-height: 440px; font-size: 12px; line-height: 1.65;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }

.smc-err, .smc-warnbox, .smc-okbox { padding: 10px 13px; border-radius: 8px; font-size: 12.5px; line-height: 1.6; }
.smc-err { color: #c13b3b; border: 1px solid rgba(193,59,59,.35); background: rgba(193,59,59,.08); }
.smc-warnbox { color: #b07908; border: 1px solid rgba(176,121,8,.4); background: rgba(176,121,8,.09); }
.smc-okbox { color: #0f8a57; border: 1px solid rgba(15,138,87,.35); background: rgba(15,138,87,.08); word-break: break-all; }
.smc-empty { padding: 26px 14px; text-align: center; font-size: 13px; opacity: .58; }

.smc-scrim { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(0,0,0,.42); }
.smc-modal { width: 100%; max-width: 540px; max-height: 88vh; overflow: auto; padding: 20px 22px;
  border-radius: 11px; border: 1px solid var(--border-color, rgba(128,128,128,.3));
  background: var(--background-primary, var(--fill-primary, #fff)); box-shadow: 0 24px 60px -18px rgba(0,0,0,.55);
  display: flex; flex-direction: column; gap: 11px; }
.smc-modal.smc-wide { max-width: 760px; }
.smc-modal-head { display: flex; align-items: flex-start; gap: 10px; }
.smc-modal-head h4 { margin: 0; font-size: 16px; font-weight: 600; }
.smc-modal-head p { margin: 5px 0 0; font-size: 12.5px; opacity: .7; line-height: 1.6; }
.smc-x { margin-left: auto; border: 0; background: transparent; color: inherit; opacity: .55;
  font-size: 16px; line-height: 1; cursor: pointer; padding: 2px 4px; flex: none; }
.smc-x:hover { opacity: 1; }
.smc-x:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: 2px; border-radius: 4px; }
.smc-foot { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }

.smc-detect { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 8px 11px; border-radius: 8px;
  font-size: 12.5px; border: 1px solid rgba(58,79,216,.35); background: rgba(58,79,216,.08); }
.smc-badge { font-family: ui-monospace, monospace; font-size: 9.5px; font-weight: 600; letter-spacing: .06em;
  background: var(--accent-color, #3a4fd8); color: #fff; padding: 2px 6px; border-radius: 3px; }
.smc-peek { border: 1px solid var(--border-color, rgba(128,128,128,.24)); border-radius: 8px; overflow: hidden; }
.smc-peek-sum { display: block; width: 100%; text-align: left; border: 0; font: inherit; font-size: 12.5px;
  padding: 7px 11px; cursor: pointer; color: inherit; background: var(--fill-secondary, rgba(128,128,128,.12)); opacity: .82; }
.smc-peek-sum:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: -2px; }

.smc-verify { border: 1px solid var(--border-color, rgba(128,128,128,.24)); border-radius: 8px; padding: 11px 13px;
  display: flex; flex-direction: column; gap: 3px; }
.smc-verify > b { font-size: 12.5px; font-weight: 600; margin-bottom: 5px; }
.smc-vsub { font-weight: 400; opacity: .55; font-size: 11.5px; }
.smc-v { display: flex; gap: 9px; align-items: baseline; font-size: 12.5px; line-height: 1.55; opacity: .82; }
.smc-vi { font-family: ui-monospace, monospace; font-weight: 700; flex: none; }
.smc-v-ok .smc-vi { color: #0f8a57; }
.smc-v-bad { opacity: 1; }
.smc-v-bad .smc-vi { color: #b07908; }
.smc-pick { display: flex; align-items: baseline; gap: 9px; padding: 4px 0; font-size: 12.5px; cursor: pointer; }
.smc-pick input { margin: 0; accent-color: var(--accent-color, #3a4fd8); flex: none; }
.smc-pn { font-family: ui-monospace, monospace; font-weight: 500; flex: none; }
.smc-pd { opacity: .55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

.smc-req { font-size: 11.5px; opacity: .62; }
.smc-req b { display: block; font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 5px; opacity: .8; }
.smc-req ul { margin: 0; padding-left: 17px; } .smc-req li { margin-bottom: 3px; line-height: 1.6; }
.smc-req code, .smc-hint code { font-family: ui-monospace, monospace; font-size: 11px;
  border: 1px solid var(--border-color, rgba(128,128,128,.26)); padding: .5px 4px; border-radius: 3px; }

.smc-drop { display: block; text-align: center; padding: 32px 16px; border-radius: 9px; cursor: pointer;
  font-size: 13px; opacity: .78; border: 1.5px dashed var(--border-color, rgba(128,128,128,.4));
  background: var(--fill-secondary, rgba(128,128,128,.08)); }
.smc-drop:hover { border-color: var(--accent-color, #3a4fd8); }
.smc-big { display: block; font-size: 24px; opacity: .5; margin-bottom: 7px; font-family: ui-monospace, monospace; }

.smc-composer { border: 1.5px solid var(--accent-color, #3a4fd8); border-radius: 10px; padding: 13px 14px;
  background: var(--fill-secondary, rgba(58,79,216,.06)); }
.smc-composer p { margin: 0; font-size: 13.5px; line-height: 1.6; }

.smc-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.smc-card2 { border: 1px solid var(--border-color, rgba(128,128,128,.24)); border-radius: 9px; padding: 12px 14px; }
.smc-card-top { display: flex; align-items: flex-start; gap: 8px; }
.smc-cn { font-family: ui-monospace, monospace; font-size: 13px; font-weight: 500; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; }
.smc-act { border: 1px solid var(--border-color, rgba(128,128,128,.4)); background: transparent; border-radius: 6px;
  width: 24px; height: 24px; cursor: pointer; color: inherit; font-size: 12px; line-height: 1; flex: none; padding: 0; }
.smc-act:hover:not(:disabled) { background: var(--fill-secondary, rgba(128,128,128,.16)); }
.smc-act-on { color: #0f8a57; border-color: rgba(15,138,87,.4); background: rgba(15,138,87,.1); cursor: default; }
.smc-act:focus-visible { outline: 2px solid var(--accent-color, #3a4fd8); outline-offset: 1px; }
.smc-cm { font-size: 11px; opacity: .55; font-family: ui-monospace, monospace; margin: 3px 0 6px;
  display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.smc-ver { border: 1px solid rgba(58,79,216,.35); color: #3a4fd8; padding: 0 5px; border-radius: 3px; font-size: 10px; }
.smc-cd { font-size: 12px; opacity: .72; line-height: 1.55;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

@media (prefers-reduced-motion: reduce) { .smc-root *, .smc-modal * { transition: none !important; } }
`

/** Install the stylesheet once; returns the disposer `ctx.effect` expects. */
export function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById(STYLE_ID)) return () => {}
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.append(el)
  return () => el.remove()
}
