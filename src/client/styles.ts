/**
 * One scoped stylesheet for both sections.
 *
 * Every rule is nested under a `dsm-` prefix so the panel cannot leak into
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
 * @module dsh-skill-mcp/client/styles
 */

const STYLE_ID = 'dsh-skill-mcp-styles'

const CSS = `
.dsm-root, .dsm-scrim {
  --dsm-bg: #ffffff;
  --dsm-surface: #f4f5f8;
  --dsm-raise: #eaecf1;
  --dsm-line: rgba(20,24,40,.14);
  --dsm-line-strong: rgba(20,24,40,.26);
  --dsm-text: #14171f;
  --dsm-soft: rgba(20,24,40,.62);
  --dsm-faint: rgba(20,24,40,.45);
  --dsm-accent: #3a4fd8;
  /* Text that sits ON the accent. The accent flips light in dark mode, so a
     hardcoded white here is the same class of bug as a background without a
     colour: a pale button with pale text on it. */
  --dsm-on-accent: #ffffff;
  --dsm-accent-soft: rgba(58,79,216,.10);
  --dsm-ok: #0f8a57;
  --dsm-ok-soft: rgba(15,138,87,.10);
  --dsm-warn: #a87508;
  --dsm-warn-soft: rgba(168,117,8,.12);
  --dsm-err: #c13b3b;
  --dsm-err-soft: rgba(193,59,59,.10);
  --dsm-shadow: 0 24px 60px -18px rgba(20,24,40,.35);
  color: var(--dsm-text);
}
body[data-ds-dark-theme] .dsm-root, body[data-ds-dark-theme] .dsm-scrim {
  --dsm-bg: #1a1d24;
  --dsm-surface: #22262f;
  --dsm-raise: #2b303b;
  --dsm-line: rgba(255,255,255,.13);
  --dsm-line-strong: rgba(255,255,255,.26);
  --dsm-text: #e7e9ef;
  --dsm-soft: rgba(231,233,239,.66);
  --dsm-faint: rgba(231,233,239,.44);
  --dsm-accent: #8b9bff;
  --dsm-on-accent: #10131a;
  --dsm-accent-soft: rgba(139,155,255,.14);
  --dsm-ok: #3ed68d;
  --dsm-ok-soft: rgba(62,214,141,.13);
  --dsm-warn: #e3ac42;
  --dsm-warn-soft: rgba(227,172,66,.14);
  --dsm-err: #f27373;
  --dsm-err-soft: rgba(242,115,115,.14);
  --dsm-shadow: 0 24px 60px -18px rgba(0,0,0,.7);
}

.dsm-root { display: flex; flex-direction: column; gap: 13px; min-width: 0; }
.dsm-head { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
.dsm-head h3 { margin: 0 0 4px; font-size: 17px; font-weight: 600; }
.dsm-head p, .dsm-lede { margin: 0; font-size: 13px; opacity: .72; max-width: 62ch; line-height: 1.62; }
.dsm-spacer { margin-left: auto; }
.dsm-hint { font-size: 11.5px; opacity: .58; line-height: 1.55; }
.dsm-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; opacity: .68; }
.dsm-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dsm-dim { opacity: .5; }

.dsm-bar { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; font-size: 12.5px; opacity: .85; }
.dsm-input, .dsm-mono-input, .dsm-editor, .dsm-field input, .dsm-field textarea {
  font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 6px; color: inherit;
  background: var(--dsm-surface);
  border: 1px solid var(--dsm-line); }
.dsm-input { flex: 1; min-width: 150px; }
.dsm-mono-input, .dsm-editor { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; width: 100%; }
.dsm-editor { min-height: 320px; line-height: 1.7; resize: vertical; }
.dsm-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.dsm-field label { font-size: 12.5px; font-weight: 500; opacity: .8; }
.dsm-field textarea { line-height: 1.6; resize: vertical; }
.dsm-input:focus-visible, .dsm-mono-input:focus-visible, .dsm-editor:focus-visible,
.dsm-field input:focus-visible, .dsm-field textarea:focus-visible {
  outline: 2px solid var(--dsm-accent); outline-offset: -1px; }

.dsm-btn { font: inherit; font-size: 12.5px; padding: 5px 12px; border-radius: 6px; cursor: pointer;
  color: inherit; background: transparent; border: 1px solid var(--dsm-line-strong); }
.dsm-btn:hover:not(:disabled) { background: var(--dsm-surface); }
.dsm-btn:disabled { opacity: .45; cursor: default; }
.dsm-btn.dsm-primary { background: var(--dsm-accent); border-color: var(--dsm-accent); color: var(--dsm-on-accent); font-weight: 500; }
.dsm-btn:focus-visible, .dsm-back:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 1px; }
.dsm-back { border: 0; background: transparent; color: inherit; font: inherit; font-size: 13px;
  opacity: .72; cursor: pointer; padding: 0; align-self: flex-start; }

.dsm-switch { display: inline-flex; gap: 2px; padding: 2px; border-radius: 7px;
  border: 1px solid var(--dsm-line); }
.dsm-switch button { border: 0; background: transparent; font: inherit; font-size: 12px;
  padding: 4px 11px; border-radius: 5px; cursor: pointer; color: inherit; opacity: .66; }
.dsm-switch button[aria-selected="true"] { background: var(--dsm-raise); opacity: 1; font-weight: 500; }
.dsm-switch button:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 1px; }

.dsm-menu { position: relative; }
/* Fixed, not absolute: the settings panel clips its own overflow, and an
   absolutely positioned menu lost its left half to that clip. */
.dsm-menu-list { color: var(--dsm-text); position: fixed; z-index: 300; min-width: 240px; max-width: min(320px, calc(100vw - 16px)); padding: 5px;
  border-radius: 8px; border: 1px solid var(--dsm-line-strong);
  background: var(--dsm-bg); box-shadow: var(--dsm-shadow); }
.dsm-menu-list button { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; white-space: nowrap;
  border: 0; background: transparent; font: inherit; font-size: 13px; color: inherit;
  padding: 7px 9px; border-radius: 5px; cursor: pointer; }
.dsm-menu-list button:hover { background: var(--dsm-raise); }
.dsm-menu-list hr { border: 0; border-top: 1px solid var(--dsm-line); margin: 5px 2px; }
.dsm-g { width: 14px; text-align: center; opacity: .55; font-family: ui-monospace, monospace; font-size: 11px; flex: none; }

.dsm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dsm-table th { text-align: left; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase;
  opacity: .5; font-weight: 500; padding: 0 10px 8px;
  border-bottom: 1px solid var(--dsm-line); }
.dsm-table td { padding: 9px 10px; border-bottom: 1px solid var(--dsm-line); vertical-align: top; }
.dsm-table tr.dsm-click { cursor: pointer; }
.dsm-table tr.dsm-click:hover td { background: var(--dsm-surface); }
.dsm-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 500; }
.dsm-desc { font-size: 11.5px; opacity: .6; margin-top: 2px; line-height: 1.5; max-width: 52ch;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dsm-problem { font-size: 11.5px; color: var(--dsm-warn); margin-top: 4px; line-height: 1.5; max-width: 56ch; }
.dsm-tok { white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dsm-tok b { font-weight: 600; font-variant-numeric: tabular-nums; font-size: 13px; }
.dsm-tok span { font-size: 10.5px; opacity: .5; margin-left: 3px; }
.dsm-tok em { display: block; font-style: normal; font-size: 10.5px; color: var(--dsm-ok); margin-top: 1px; }
.dsm-tok em.dsm-muted { color: var(--dsm-faint); }

/* State menu: pick directly instead of cycling. Four states behind one pill
   meant up to three blind clicks to reach the one you wanted. */
.dsm-state-wrap { position: relative; display: inline-block; }
.dsm-state-menu { position: fixed; z-index: 300; min-width: 260px; max-width: min(340px, calc(100vw - 16px)); padding: 5px;
  border-radius: 8px; border: 1px solid var(--dsm-line-strong); background: var(--dsm-bg);
  color: var(--dsm-text); box-shadow: var(--dsm-shadow); }
.dsm-state-menu button { display: block; width: 100%; text-align: left; border: 0; background: transparent;
  color: inherit; font: inherit; padding: 7px 9px; border-radius: 5px; cursor: pointer; }
.dsm-state-menu button:hover { background: var(--dsm-raise); }
.dsm-state-menu button[aria-current="true"] { background: var(--dsm-raise); }
.dsm-state-menu i { font-style: normal; font-family: ui-monospace, monospace; font-size: 11.5px; font-weight: 600; }
.dsm-state-menu small { display: block; font-size: 11px; opacity: .6; line-height: 1.5; margin-top: 2px; }
.dsm-state { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 500;
  padding: 3px 9px; border-radius: 20px; cursor: pointer; white-space: nowrap; border: 1px solid; background: transparent; }
.dsm-state:disabled { opacity: .5; cursor: default; }
.dsm-state:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; }
.dsm-s-on { color: var(--dsm-ok); border-color: var(--dsm-ok); background: var(--dsm-ok-soft); }
.dsm-s-name { color: var(--dsm-warn); border-color: var(--dsm-warn); background: var(--dsm-warn-soft); }
.dsm-s-user { color: var(--dsm-accent); border-color: var(--dsm-accent); background: var(--dsm-accent-soft); }
.dsm-s-off { opacity: .6; border-color: var(--dsm-line-strong); }

.dsm-page { display: flex; align-items: center; gap: 10px; font-size: 12px; opacity: .8; }
.dsm-legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 11.5px; opacity: .62; line-height: 1.6; }
.dsm-legend i { font-style: normal; font-family: ui-monospace, monospace; font-weight: 600; margin-right: 4px; }

.dsm-chip { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; padding: 2px 7px; border-radius: 20px; white-space: nowrap;
  border: 1px solid var(--dsm-line-strong); }
.dsm-chip.dsm-warn { color: var(--dsm-warn); border-color: var(--dsm-warn); background: var(--dsm-warn-soft); }
.dsm-chip.dsm-ok { color: var(--dsm-ok); border-color: var(--dsm-ok); background: var(--dsm-ok-soft); }
.dsm-budget { display: inline-flex; align-items: baseline; gap: 5px; font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; padding: 3px 10px; border-radius: 20px;
  border: 1px solid var(--dsm-line); }
.dsm-bl { font-size: 9.5px; opacity: .55; }
.dsm-budget b { font-weight: 600; font-variant-numeric: tabular-nums; }
.dsm-bd { color: var(--dsm-ok); font-size: 11px; }

.dsm-card { border: 1px solid var(--dsm-line); border-radius: 9px; overflow: hidden; }
.dsm-card + .dsm-card { margin-top: 8px; }
.dsm-card-off { border-style: dashed; opacity: .68; }
.dsm-row { display: flex; align-items: center; gap: 10px; padding: 11px 13px; }
.dsm-grow { flex: 1; min-width: 0; }
.dsm-tools { border-top: 1px solid var(--dsm-line); }
.dsm-tool { display: flex; gap: 10px; align-items: center; padding: 6px 13px 6px 34px; font-size: 12px; }
.dsm-tool code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; flex: none; }
.dsm-tool > span:not(.dsm-ttok) { opacity: .5; font-size: 11.5px; flex: 1; }
.dsm-ttok { font-family: ui-monospace, monospace; font-size: 10.5px; opacity: .5; flex: none; font-variant-numeric: tabular-nums; }
.dsm-caret { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 2px 4px;
  font-family: ui-monospace, monospace; font-size: 10px; opacity: .6; flex: none; }
.dsm-caret:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 1px; border-radius: 3px; }

.dsm-toggle, .dsm-tool-toggle { position: relative; border-radius: 11px; flex: none; cursor: pointer; padding: 0;
  border: 1px solid var(--dsm-line-strong); background: var(--dsm-raise);
  transition: background .15s, border-color .15s; }
.dsm-toggle { width: 36px; height: 20px; }
.dsm-tool-toggle { width: 28px; height: 16px; }
.dsm-toggle::after, .dsm-tool-toggle::after { content: ""; position: absolute; top: 2px; left: 2px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.35); transition: transform .15s; }
.dsm-toggle::after { width: 14px; height: 14px; }
.dsm-tool-toggle::after { width: 10px; height: 10px; top: 2px; }
.dsm-toggle[aria-pressed="true"] { background: var(--dsm-accent); border-color: var(--dsm-accent); }
.dsm-toggle[aria-pressed="true"]::after { transform: translateX(16px); background: var(--dsm-on-accent); }
.dsm-tool-toggle[aria-pressed="true"] { background: var(--dsm-ok); border-color: var(--dsm-ok); }
.dsm-tool-toggle[aria-pressed="true"]::after { transform: translateX(12px); }
.dsm-toggle:disabled, .dsm-tool-toggle:disabled { opacity: .45; cursor: default; }
.dsm-toggle:focus-visible, .dsm-tool-toggle:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; }

/* The tree only earns a column when there is something to choose between.
   A single-file skill used to get a 210px sidebar holding one row while the
   text it was supposed to help you read got squeezed into what was left. */
.dsm-detail { display: grid; grid-template-columns: 168px minmax(0, 1fr); gap: 12px; min-height: 300px; }
.dsm-detail.dsm-solo { grid-template-columns: minmax(0, 1fr); }
.dsm-detail.dsm-solo .dsm-tree { display: none; }
@media (max-width: 720px) { .dsm-detail { grid-template-columns: minmax(0, 1fr); } .dsm-tree { display: none; } }
.dsm-tree { border: 1px solid var(--dsm-line); border-radius: 8px; padding: 8px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; overflow: auto; max-height: 440px; }
.dsm-tree button { display: block; width: 100%; text-align: left; border: 0; background: transparent;
  color: inherit; font: inherit; padding: 4px 8px; border-radius: 5px; cursor: pointer; opacity: .7;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsm-tree button[aria-current="true"] { background: var(--dsm-raise); opacity: 1; font-weight: 500; }
.dsm-tree button:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: -1px; }

.dsm-pane { border: 1px solid var(--dsm-line); border-radius: 8px;
  display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.dsm-pane-bar { display: flex; align-items: center; gap: 8px; padding: 5px 10px; font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .7;
  border-bottom: 1px solid var(--dsm-line); }
.dsm-seg { margin-left: auto; display: inline-flex; gap: 2px; padding: 2px; border-radius: 6px;
  border: 1px solid var(--dsm-line); }
.dsm-seg button { border: 0; background: transparent; padding: 3px 9px; font-family: inherit; border-radius: 4px; cursor: pointer;
  color: inherit; font-size: 11.5px; line-height: 1.3; opacity: .6; font-family: ui-monospace, monospace; }
.dsm-seg button[aria-selected="true"] { background: var(--dsm-raise); opacity: 1; }
.dsm-seg button:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 1px; }
.dsm-pre { background: var(--dsm-surface); margin: 0; padding: 13px 15px; overflow: auto; max-height: 440px; font-size: 12px; line-height: 1.65;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }

.dsm-err, .dsm-warnbox, .dsm-okbox { padding: 10px 13px; border-radius: 8px; font-size: 12.5px; line-height: 1.6; }
.dsm-err { color: var(--dsm-err); border: 1px solid var(--dsm-err); background: var(--dsm-err-soft); }
.dsm-warnbox { color: var(--dsm-warn); border: 1px solid var(--dsm-warn); background: var(--dsm-warn-soft); }
.dsm-okbox { color: var(--dsm-ok); border: 1px solid var(--dsm-ok); background: var(--dsm-ok-soft); word-break: break-all; }
.dsm-empty { padding: 26px 14px; text-align: center; font-size: 13px; opacity: .58; }

.dsm-scrim { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(0,0,0,.42); }
.dsm-modal { width: 100%; max-width: 540px; max-height: 86vh; overflow-y: auto; padding: 20px 22px 0;
  border-radius: 11px; border: 1px solid var(--dsm-line-strong);
  background: var(--dsm-bg); color: var(--dsm-text); box-shadow: var(--dsm-shadow);
  display: flex; flex-direction: column; gap: 11px; }
/* The card scrolls and the buttons ride the bottom of it. A repository with
   twenty skills used to push them past the edge of the screen, leaving the
   dialog with no visible way to continue or cancel.
   Flex children shrink by default, so a tall neighbour squeezed the peek row
   and the output box down to a sliver of themselves — inside a scrolling
   column nothing should shrink, it should simply scroll past. */
.dsm-modal > * { flex: none; }
.dsm-verify { max-height: 44vh; overflow-y: auto; }
.dsm-modal .dsm-pre { max-height: 34vh; }
.dsm-modal.dsm-wide { max-width: 760px; }
.dsm-modal-head { display: flex; align-items: flex-start; gap: 10px; }
.dsm-modal-head h4 { margin: 0; font-size: 16px; font-weight: 600; }
.dsm-modal-head p { margin: 5px 0 0; font-size: 12.5px; opacity: .7; line-height: 1.6; }
.dsm-x { margin-left: auto; border: 0; background: transparent; color: inherit; opacity: .55;
  font-size: 16px; line-height: 1; cursor: pointer; padding: 2px 4px; flex: none; }
.dsm-x:hover { opacity: 1; }
.dsm-x:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; border-radius: 4px; }
.dsm-foot { position: sticky; bottom: 0; z-index: 2; display: flex; gap: 8px; justify-content: flex-end;
  flex: none; margin: auto -22px 0; padding: 12px 22px; border-top: 1px solid var(--dsm-line);
  background: var(--dsm-bg); }

.dsm-detect { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 8px 11px; border-radius: 8px;
  font-size: 12.5px; border: 1px solid var(--dsm-accent); background: var(--dsm-accent-soft); }
.dsm-badge { font-family: ui-monospace, monospace; font-size: 9.5px; font-weight: 600; letter-spacing: .06em;
  background: var(--dsm-accent); color: var(--dsm-on-accent); padding: 2px 6px; border-radius: 3px; }
.dsm-peek { border: 1px solid var(--dsm-line); border-radius: 8px; overflow: hidden; }
.dsm-peek-sum { display: block; width: 100%; text-align: left; border: 0; font: inherit; font-size: 12.5px;
  padding: 7px 11px; cursor: pointer; color: inherit; background: var(--dsm-surface); opacity: .82; }
.dsm-peek-sum:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: -2px; }

.dsm-verify { border: 1px solid var(--dsm-line); border-radius: 8px; padding: 11px 13px;
  display: flex; flex-direction: column; gap: 3px; }
.dsm-verify > b { font-size: 12.5px; font-weight: 600; margin-bottom: 5px; display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
.dsm-vsub { font-weight: 400; opacity: .55; font-size: 11.5px; }
.dsm-v { display: flex; gap: 9px; align-items: baseline; font-size: 12.5px; line-height: 1.55; opacity: .82; }
.dsm-vi { font-family: ui-monospace, monospace; font-weight: 700; flex: none; }
.dsm-v-ok .dsm-vi { color: var(--dsm-ok); }
.dsm-v-bad { opacity: 1; }
.dsm-v-bad .dsm-vi { color: var(--dsm-warn); }
.dsm-pick { display: flex; align-items: baseline; gap: 9px; padding: 4px 0; font-size: 12.5px; cursor: pointer; }
.dsm-pick input { margin: 0; accent-color: var(--dsm-accent); flex: none; }
.dsm-pn { font-family: ui-monospace, monospace; font-weight: 500; flex: none; }
.dsm-pd { opacity: .55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

.dsm-req { font-size: 11.5px; opacity: .62; }
.dsm-req > summary { cursor: pointer; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; opacity: .75; padding: 2px 0; }
.dsm-req > summary:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; border-radius: 3px; }
.dsm-req[open] > summary { margin-bottom: 6px; }
.dsm-btn.dsm-tiny { font-size: 11px; padding: 1px 7px; margin-left: 7px; font-weight: 400; }
.dsm-req ul { margin: 0; padding-left: 17px; } .dsm-req li { margin-bottom: 3px; line-height: 1.6; }
.dsm-req code, .dsm-hint code { font-family: ui-monospace, monospace; font-size: 11px;
  border: 1px solid var(--dsm-line); padding: .5px 4px; border-radius: 3px; }

.dsm-drop { display: block; text-align: center; padding: 32px 16px; border-radius: 9px; cursor: pointer;
  font-size: 13px; opacity: .78; border: 1.5px dashed var(--dsm-line-strong);
  background: var(--dsm-surface); }
.dsm-drop:hover { border-color: var(--dsm-accent); }
.dsm-big { display: block; font-size: 24px; opacity: .5; margin-bottom: 7px; font-family: ui-monospace, monospace; }

.dsm-composer { border: 1.5px solid var(--dsm-accent); border-radius: 10px; padding: 13px 14px;
  background: var(--dsm-accent-soft); }
.dsm-composer p { margin: 0; font-size: 13.5px; line-height: 1.6; }

.dsm-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.dsm-card2 { border: 1px solid var(--dsm-line); border-radius: 9px; padding: 12px 14px; }
.dsm-card-top { display: flex; align-items: flex-start; gap: 8px; }
.dsm-cn { font-family: ui-monospace, monospace; font-size: 13px; font-weight: 500; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; }
.dsm-act { border: 1px solid var(--dsm-line-strong); background: transparent; border-radius: 6px;
  width: 24px; height: 24px; cursor: pointer; color: inherit; font-size: 12px; line-height: 1; flex: none; padding: 0; }
.dsm-act:hover:not(:disabled) { background: var(--dsm-raise); }
.dsm-act-on { color: var(--dsm-ok); border-color: var(--dsm-ok); background: var(--dsm-ok-soft); cursor: default; }
.dsm-act:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 1px; }
.dsm-cm { font-size: 11px; opacity: .55; font-family: ui-monospace, monospace; margin: 3px 0 6px;
  display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.dsm-ver { border: 1px solid var(--dsm-accent); color: var(--dsm-accent); padding: 0 5px; border-radius: 3px; font-size: 10px; }
.dsm-link { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 0; text-align: left; }
.dsm-link:hover { text-decoration: underline; }
.dsm-link:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 2px; border-radius: 3px; }
a.dsm-btn { text-decoration: none; display: inline-block; }
.dsm-topic { cursor: pointer; font-family: inherit; }
.dsm-topic-on { background: var(--dsm-accent); border-color: var(--dsm-accent); color: var(--dsm-on-accent); }
.dsm-topic:focus-visible { outline: 2px solid var(--dsm-accent); outline-offset: 1px; }
.dsm-cd { font-size: 12px; opacity: .72; line-height: 1.55;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* code-plugin tab */
.dsm-body { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px 12px;
  border-top: 1px solid var(--dsm-line); }
.dsm-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.dsm-btn.dsm-danger { border-color: var(--dsm-bad); color: var(--dsm-bad); }
.dsm-btn.dsm-danger:hover:not(:disabled) { background: var(--dsm-bad-bg); }
.dsm-count { font-size: 12.5px; opacity: .75; padding: 2px 0; }
.dsm-state { font-size: 12px; white-space: nowrap; }
.dsm-restart { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 8px;
  font-size: 12.8px; background: var(--dsm-warn-bg); border: 1px solid var(--dsm-warn); }
.dsm-why { margin: 0; font-size: 12.3px; line-height: 1.55; color: var(--dsm-accent); }
.dsm-select { font: inherit; font-size: 12.5px; padding: 5px 8px; border-radius: 6px; color: inherit;
  background: var(--dsm-raise); border: 1px solid var(--dsm-line-strong); cursor: pointer; }
.dsm-mkt { gap: 6px; }
.dsm-chip.dsm-cat { margin-left: 7px; font-weight: 400; opacity: .8; }
.dsm-log { margin: 0; font-family: var(--dsm-mono); font-size: 11.5px; line-height: 1.55;
  background: var(--dsm-surface); border: 1px solid var(--dsm-line); border-radius: 8px;
  padding: 9px 11px; max-height: 190px; overflow: auto; white-space: pre-wrap; }

@media (prefers-reduced-motion: reduce) { .dsm-root *, .dsm-modal * { transition: none !important; } }
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
