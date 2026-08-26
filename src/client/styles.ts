/**
 * One scoped stylesheet for both sections.
 *
 * Every rule is nested under a `smc-` prefix so the panel cannot leak into
 * the rest of the app.
 *
 * Colours come from this file's own tokens, not from the host's. dsh
 * publishes `--ds-*` and `--dsw-*` custom properties and nothing resembling
 * `--background-primary`, so an earlier version that read those fell back to
 * its literals on every single one — including a hardcoded white modal, which
 * in the dark theme meant white text on a white card. The host marks dark
 * with `body[data-ds-dark-theme]`, so both palettes are defined here and
 * every surface sets its `background` and its `color` together. A background
 * without a paired colour is the bug that produced the invisible dialog.
 *
 * @module dsh-skill-mcp-console/client/styles
 */

const STYLE_ID = 'dsh-skill-mcp-console-styles'

const CSS = `
.smc-root, .smc-scrim {
  --smc-bg: #ffffff;
  --smc-surface: #f4f5f8;
  --smc-raise: #eaecf1;
  --smc-line: rgba(20,24,40,.14);
  --smc-line-strong: rgba(20,24,40,.26);
  --smc-text: #14171f;
  --smc-soft: rgba(20,24,40,.62);
  --smc-faint: rgba(20,24,40,.45);
  --smc-accent: #3a4fd8;
  /* Text that sits ON the accent. The accent flips light in dark mode, so a
     hardcoded white here is the same class of bug as a background without a
     colour: a pale button with pale text on it. */
  --smc-on-accent: #ffffff;
  --smc-accent-soft: rgba(58,79,216,.10);
  --smc-ok: #0f8a57;
  --smc-ok-soft: rgba(15,138,87,.10);
  --smc-warn: #a87508;
  --smc-warn-soft: rgba(168,117,8,.12);
  --smc-err: #c13b3b;
  --smc-err-soft: rgba(193,59,59,.10);
  --smc-shadow: 0 24px 60px -18px rgba(20,24,40,.35);
  color: var(--smc-text);
}
body[data-ds-dark-theme] .smc-root, body[data-ds-dark-theme] .smc-scrim {
  --smc-bg: #1a1d24;
  --smc-surface: #22262f;
  --smc-raise: #2b303b;
  --smc-line: rgba(255,255,255,.13);
  --smc-line-strong: rgba(255,255,255,.26);
  --smc-text: #e7e9ef;
  --smc-soft: rgba(231,233,239,.66);
  --smc-faint: rgba(231,233,239,.44);
  --smc-accent: #8b9bff;
  --smc-on-accent: #10131a;
  --smc-accent-soft: rgba(139,155,255,.14);
  --smc-ok: #3ed68d;
  --smc-ok-soft: rgba(62,214,141,.13);
  --smc-warn: #e3ac42;
  --smc-warn-soft: rgba(227,172,66,.14);
  --smc-err: #f27373;
  --smc-err-soft: rgba(242,115,115,.14);
  --smc-shadow: 0 24px 60px -18px rgba(0,0,0,.7);
}

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
  background: var(--smc-surface);
  border: 1px solid var(--smc-line); }
.smc-input { flex: 1; min-width: 150px; }
.smc-mono-input, .smc-editor { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; width: 100%; }
.smc-editor { min-height: 320px; line-height: 1.7; resize: vertical; }
.smc-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.smc-field label { font-size: 12.5px; font-weight: 500; opacity: .8; }
.smc-field textarea { line-height: 1.6; resize: vertical; }
.smc-input:focus-visible, .smc-mono-input:focus-visible, .smc-editor:focus-visible,
.smc-field input:focus-visible, .smc-field textarea:focus-visible {
  outline: 2px solid var(--smc-accent); outline-offset: -1px; }

.smc-btn { font: inherit; font-size: 12.5px; padding: 5px 12px; border-radius: 6px; cursor: pointer;
  color: inherit; background: transparent; border: 1px solid var(--smc-line-strong); }
.smc-btn:hover:not(:disabled) { background: var(--smc-surface); }
.smc-btn:disabled { opacity: .45; cursor: default; }
.smc-btn.smc-primary { background: var(--smc-accent); border-color: var(--smc-accent); color: var(--smc-on-accent); font-weight: 500; }
.smc-btn:focus-visible, .smc-back:focus-visible { outline: 2px solid var(--smc-accent); outline-offset: 1px; }
.smc-back { border: 0; background: transparent; color: inherit; font: inherit; font-size: 13px;
  opacity: .72; cursor: pointer; padding: 0; align-self: flex-start; }

.smc-switch { display: inline-flex; gap: 2px; padding: 2px; border-radius: 7px;
  border: 1px solid var(--smc-line); }
.smc-switch button { border: 0; background: transparent; font: inherit; font-size: 12px;
  padding: 4px 11px; border-radius: 5px; cursor: pointer; color: inherit; opacity: .66; }
.smc-switch button[aria-selected="true"] { background: var(--smc-raise); opacity: 1; font-weight: 500; }
.smc-switch button:focus-visible { outline: 2px solid var(--smc-accent); outline-offset: 1px; }

.smc-menu { position: relative; }
/* Fixed, not absolute: the settings panel clips its own overflow, and an
   absolutely positioned menu lost its left half to that clip. */
.smc-menu-list { color: var(--smc-text); position: fixed; z-index: 300; min-width: 240px; max-width: min(320px, calc(100vw - 16px)); padding: 5px;
  border-radius: 8px; border: 1px solid var(--smc-line-strong);
  background: var(--smc-bg); box-shadow: var(--smc-shadow); }
.smc-menu-list button { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; white-space: nowrap;
  border: 0; background: transparent; font: inherit; font-size: 13px; color: inherit;
  padding: 7px 9px; border-radius: 5px; cursor: pointer; }
.smc-menu-list button:hover { background: var(--smc-raise); }
.smc-menu-list hr { border: 0; border-top: 1px solid var(--smc-line); margin: 5px 2px; }
.smc-g { width: 14px; text-align: center; opacity: .55; font-family: ui-monospace, monospace; font-size: 11px; flex: none; }

.smc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.smc-table th { text-align: left; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase;
  opacity: .5; font-weight: 500; padding: 0 10px 8px;
  border-bottom: 1px solid var(--smc-line); }
.smc-table td { padding: 9px 10px; border-bottom: 1px solid var(--smc-line); vertical-align: top; }
.smc-table tr.smc-click { cursor: pointer; }
.smc-table tr.smc-click:hover td { background: var(--smc-surface); }
.smc-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 500; }
.smc-desc { font-size: 11.5px; opacity: .6; margin-top: 2px; line-height: 1.5; max-width: 52ch;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.smc-problem { font-size: 11.5px; color: var(--smc-warn); margin-top: 4px; line-height: 1.5; max-width: 56ch; }
.smc-tok { white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.smc-tok b { font-weight: 600; font-variant-numeric: tabular-nums; font-size: 13px; }
.smc-tok span { font-size: 10.5px; opacity: .5; margin-left: 3px; }
.smc-tok em { display: block; font-style: normal; font-size: 10.5px; color: var(--smc-ok); margin-top: 1px; }

.smc-state { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 500;
  padding: 3px 9px; border-radius: 20px; cursor: pointer; white-space: nowrap; border: 1px solid; background: transparent; }
.smc-state:disabled { opacity: .5; cursor: default; }
.smc-state:focus-visible { outline: 2px solid var(--smc-accent); outline-offset: 2px; }
.smc-s-on { color: var(--smc-ok); border-color: var(--smc-ok); background: var(--smc-ok-soft); }
.smc-s-name { color: var(--smc-warn); border-color: var(--smc-warn); background: var(--smc-warn-soft); }
.smc-s-user { color: var(--smc-accent); border-color: var(--smc-accent); background: var(--smc-accent-soft); }
.smc-s-off { opacity: .6; border-color: var(--smc-line-strong); }

.smc-legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 11.5px; opacity: .62; line-height: 1.6; }
.smc-legend i { font-style: normal; font-family: ui-monospace, monospace; font-weight: 600; margin-right: 4px; }

.smc-chip { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; padding: 2px 7px; border-radius: 20px; white-space: nowrap;
  border: 1px solid var(--smc-line-strong); }
.smc-chip.smc-warn { color: var(--smc-warn); border-color: var(--smc-warn); background: var(--smc-warn-soft); }
.smc-chip.smc-ok { color: var(--smc-ok); border-color: var(--smc-ok); background: var(--smc-ok-soft); }
.smc-budget { display: inline-flex; align-items: baseline; gap: 5px; font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; padding: 3px 10px; border-radius: 20px;
  border: 1px solid var(--smc-line); }
.smc-bl { font-size: 9.5px; opacity: .55; }
.smc-budget b { font-weight: 600; font-variant-numeric: tabular-nums; }
.smc-bd { color: var(--smc-ok); font-size: 11px; }

.smc-card { border: 1px solid var(--smc-line); border-radius: 9px; overflow: hidden; }
.smc-card + .smc-card { margin-top: 8px; }
.smc-card-off { border-style: dashed; opacity: .68; }
.smc-row { display: flex; align-items: center; gap: 10px; padding: 11px 13px; }
.smc-grow { flex: 1; min-width: 0; }
.smc-tools { border-top: 1px solid var(--smc-line); }
.smc-tool { display: flex; gap: 10px; align-items: center; padding: 6px 13px 6px 34px; font-size: 12px; }
.smc-tool code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; flex: none; }
.smc-tool > span:not(.smc-ttok) { opacity: .5; font-size: 11.5px; flex: 1; }
.smc-ttok { font-family: ui-monospace, monospace; font-size: 10.5px; opacity: .5; flex: none; font-variant-numeric: tabular-nums; }
.smc-caret { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 2px 4px;
  font-family: ui-monospace, monospace; font-size: 10px; opacity: .6; flex: none; }
.smc-caret:focus-visible { outline: 2px solid var(--smc-accent); outline-offset: 1px; border-radius: 3px; }

.smc-toggle, .smc-tool-toggle { position: relative; border-radius: 11px; flex: none; cursor: pointer; padding: 0;
  border: 1px solid var(--smc-line-strong); background: var(--smc-raise);
  transition: background .15s, border-color .15s; }
.smc-toggle { width: 36px; height: 20px; }
.smc-tool-toggle { width: 28px; height: 16px; }
.smc-toggle::after, .smc-tool-toggle::after { content: ""; position: absolute; top: 2px; left: 2px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.35); transition: transform .15s; }
.smc-toggle::after { width: 14px; height: 14px; }
.smc-tool-toggle::after { width: 10px; height: 10px; top: 2px; }
.smc-toggle[aria-pressed="true"] { background: var(--smc-accent); border-color: var(--smc-accent); }
.smc-toggle[aria-pressed="true"]::after { transform: translateX(16px); background: var(--smc-on-accent); }
.smc-tool-toggle[aria-pressed="true"] { background: var(--smc-ok); border-color: var(--smc-ok); }
.smc-tool-toggle[aria-pressed="true"]::after { transform: translateX(12px); }
.smc-toggle:disabled, .smc-tool-toggle:disabled { opacity: .45; cursor: default; }
.smc-toggle:focus-visible, .smc-tool-toggle:focus-visible { outline: 2px solid var(--smc-accent); outline-offset: 2px; }

.smc-detail { display: grid; grid-template-columns: 210px 1fr; gap: 13px; min-height: 300px; }
@media (max-width: 680px) { .smc-detail { grid-template-columns: 1fr; } }
.smc-tree { border: 1px solid var(--smc-line); border-radius: 8px; padding: 8px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; overflow: auto; max-height: 440px; }
.smc-tree button { display: block; width: 100%; text-align: left; border: 0; background: transparent;
  color: inherit; font: inherit; padding: 4px 8px; border-radius: 5px; cursor: pointer; opacity: .7;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.smc-tree button[aria-current="true"] { background: var(--smc-raise); opacity: 1; font-weight: 500; }
.smc-tree button:focus-visible { outline: 2px solid var(--smc-accent); outline-offset: -1px; }

.smc-pane { border: 1px solid var(--smc-line); border-radius: 8px;
  display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.smc-pane-bar { display: flex; align-items: center; gap: 8px; padding: 5px 10px; font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .7;
  border-bottom: 1px solid var(--smc-line); }
.smc-seg { margin-left: auto; display: inline-flex; gap: 2px; padding: 2px; border-radius: 6px;
  border: 1px solid var(--smc-line); }
.smc-seg button { border: 0; background: transparent; padding: 2px 7px; border-radius: 4px; cursor: pointer;
  color: inherit; font-size: 11.5px; line-height: 1.3; opacity: .6; font-family: ui-monospace, monospace; }
.smc-seg button[aria-selected="true"] { background: var(--smc-raise); opacity: 1; }
.smc-seg button:focus-visible { outline: 2px solid var(--smc-accent); outline-offset: 1px; }
.smc-pre { background: var(--smc-surface); margin: 0; padding: 13px 15px; overflow: auto; max-height: 440px; font-size: 12px; line-height: 1.65;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }

.smc-err, .smc-warnbox, .smc-okbox { padding: 10px 13px; border-radius: 8px; font-size: 12.5px; line-height: 1.6; }
.smc-err { color: var(--smc-err); border: 1px solid var(--smc-err); background: var(--smc-err-soft); }
.smc-warnbox { color: var(--smc-warn); border: 1px solid var(--smc-warn); background: var(--smc-warn-soft); }
.smc-okbox { color: var(--smc-ok); border: 1px solid var(--smc-ok); background: var(--smc-ok-soft); word-break: break-all; }
.smc-empty { padding: 26px 14px; text-align: center; font-size: 13px; opacity: .58; }

.smc-scrim { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(0,0,0,.42); }
.smc-modal { width: 100%; max-width: 540px; max-height: 86vh; overflow-y: auto; padding: 20px 22px 0;
  border-radius: 11px; border: 1px solid var(--smc-line-strong);
  background: var(--smc-bg); color: var(--smc-text); box-shadow: var(--smc-shadow);
  display: flex; flex-direction: column; gap: 11px; }
/* The card scrolls and the buttons ride the bottom of it. A repository with
   twenty skills used to push them past the edge of the screen, leaving the
   dialog with no visible way to continue or cancel.
   Flex children shrink by default, so a tall neighbour squeezed the peek row
   and the output box down to a sliver of themselves — inside a scrolling
   column nothing should shrink, it should simply scroll past. */
.smc-modal > * { flex: none; }
.smc-verify { max-height: 44vh; overflow-y: auto; }
.smc-modal .smc-pre { max-height: 34vh; }
.smc-modal.smc-wide { max-width: 760px; }
.smc-modal-head { display: flex; align-items: flex-start; gap: 10px; }
.smc-modal-head h4 { margin: 0; font-size: 16px; font-weight: 600; }
.smc-modal-head p { margin: 5px 0 0; font-size: 12.5px; opacity: .7; line-height: 1.6; }
.smc-x { margin-left: auto; border: 0; background: transparent; color: inherit; opacity: .55;
  font-size: 16px; line-height: 1; cursor: pointer; padding: 2px 4px; flex: none; }
.smc-x:hover { opacity: 1; }
.smc-x:focus-visible { outline: 2px solid var(--smc-accent); outline-offset: 2px; border-radius: 4px; }
.smc-foot { position: sticky; bottom: 0; z-index: 2; display: flex; gap: 8px; justify-content: flex-end;
  flex: none; margin: auto -22px 0; padding: 12px 22px; border-top: 1px solid var(--smc-line);
  background: var(--smc-bg); }

.smc-detect { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 8px 11px; border-radius: 8px;
  font-size: 12.5px; border: 1px solid var(--smc-accent); background: var(--smc-accent-soft); }
.smc-badge { font-family: ui-monospace, monospace; font-size: 9.5px; font-weight: 600; letter-spacing: .06em;
  background: var(--smc-accent); color: var(--smc-on-accent); padding: 2px 6px; border-radius: 3px; }
.smc-peek { border: 1px solid var(--smc-line); border-radius: 8px; overflow: hidden; }
.smc-peek-sum { display: block; width: 100%; text-align: left; border: 0; font: inherit; font-size: 12.5px;
  padding: 7px 11px; cursor: pointer; color: inherit; background: var(--smc-surface); opacity: .82; }
.smc-peek-sum:focus-visible { outline: 2px solid var(--smc-accent); outline-offset: -2px; }

.smc-verify { border: 1px solid var(--smc-line); border-radius: 8px; padding: 11px 13px;
  display: flex; flex-direction: column; gap: 3px; }
.smc-verify > b { font-size: 12.5px; font-weight: 600; margin-bottom: 5px; }
.smc-vsub { font-weight: 400; opacity: .55; font-size: 11.5px; }
.smc-v { display: flex; gap: 9px; align-items: baseline; font-size: 12.5px; line-height: 1.55; opacity: .82; }
.smc-vi { font-family: ui-monospace, monospace; font-weight: 700; flex: none; }
.smc-v-ok .smc-vi { color: var(--smc-ok); }
.smc-v-bad { opacity: 1; }
.smc-v-bad .smc-vi { color: var(--smc-warn); }
.smc-pick { display: flex; align-items: baseline; gap: 9px; padding: 4px 0; font-size: 12.5px; cursor: pointer; }
.smc-pick input { margin: 0; accent-color: var(--smc-accent); flex: none; }
.smc-pn { font-family: ui-monospace, monospace; font-weight: 500; flex: none; }
.smc-pd { opacity: .55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

.smc-req { font-size: 11.5px; opacity: .62; }
.smc-req b { display: block; font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 5px; opacity: .8; }
.smc-req ul { margin: 0; padding-left: 17px; } .smc-req li { margin-bottom: 3px; line-height: 1.6; }
.smc-req code, .smc-hint code { font-family: ui-monospace, monospace; font-size: 11px;
  border: 1px solid var(--smc-line); padding: .5px 4px; border-radius: 3px; }

.smc-drop { display: block; text-align: center; padding: 32px 16px; border-radius: 9px; cursor: pointer;
  font-size: 13px; opacity: .78; border: 1.5px dashed var(--smc-line-strong);
  background: var(--smc-surface); }
.smc-drop:hover { border-color: var(--smc-accent); }
.smc-big { display: block; font-size: 24px; opacity: .5; margin-bottom: 7px; font-family: ui-monospace, monospace; }

.smc-composer { border: 1.5px solid var(--smc-accent); border-radius: 10px; padding: 13px 14px;
  background: var(--smc-accent-soft); }
.smc-composer p { margin: 0; font-size: 13.5px; line-height: 1.6; }

.smc-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.smc-card2 { border: 1px solid var(--smc-line); border-radius: 9px; padding: 12px 14px; }
.smc-card-top { display: flex; align-items: flex-start; gap: 8px; }
.smc-cn { font-family: ui-monospace, monospace; font-size: 13px; font-weight: 500; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; }
.smc-act { border: 1px solid var(--smc-line-strong); background: transparent; border-radius: 6px;
  width: 24px; height: 24px; cursor: pointer; color: inherit; font-size: 12px; line-height: 1; flex: none; padding: 0; }
.smc-act:hover:not(:disabled) { background: var(--smc-raise); }
.smc-act-on { color: var(--smc-ok); border-color: var(--smc-ok); background: var(--smc-ok-soft); cursor: default; }
.smc-act:focus-visible { outline: 2px solid var(--smc-accent); outline-offset: 1px; }
.smc-cm { font-size: 11px; opacity: .55; font-family: ui-monospace, monospace; margin: 3px 0 6px;
  display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.smc-ver { border: 1px solid var(--smc-accent); color: var(--smc-accent); padding: 0 5px; border-radius: 3px; font-size: 10px; }
.smc-topic { cursor: pointer; font-family: inherit; }
.smc-topic-on { background: var(--smc-accent); border-color: var(--smc-accent); color: var(--smc-on-accent); }
.smc-topic:focus-visible { outline: 2px solid var(--smc-accent); outline-offset: 1px; }
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
