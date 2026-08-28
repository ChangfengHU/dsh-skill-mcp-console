/**
 * One scoped stylesheet for both sections.
 *
 * Every rule is nested under a `dps-` prefix so the panel cannot leak into
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
 * @module dsh-plugin-station/client/styles
 */

const STYLE_ID = 'dsh-plugin-station-styles'

const CSS = `
.dps-root, .dps-scrim {
  --dps-bg: #ffffff;
  --dps-surface: #f4f5f8;
  --dps-raise: #eaecf1;
  --dps-line: rgba(20,24,40,.14);
  --dps-line-strong: rgba(20,24,40,.26);
  --dps-text: #14171f;
  --dps-soft: rgba(20,24,40,.62);
  --dps-faint: rgba(20,24,40,.45);
  --dps-accent: #3a4fd8;
  /* Text that sits ON the accent. The accent flips light in dark mode, so a
     hardcoded white here is the same class of bug as a background without a
     colour: a pale button with pale text on it. */
  --dps-on-accent: #ffffff;
  --dps-accent-soft: rgba(58,79,216,.10);
  --dps-ok: #0f8a57;
  --dps-ok-soft: rgba(15,138,87,.10);
  --dps-warn: #a87508;
  --dps-warn-soft: rgba(168,117,8,.12);
  --dps-err: #c13b3b;
  --dps-err-soft: rgba(193,59,59,.10);
  --dps-shadow: 0 24px 60px -18px rgba(20,24,40,.35);
  color: var(--dps-text);
}
body[data-ds-dark-theme] .dps-root, body[data-ds-dark-theme] .dps-scrim {
  --dps-bg: #1a1d24;
  --dps-surface: #22262f;
  --dps-raise: #2b303b;
  --dps-line: rgba(255,255,255,.13);
  --dps-line-strong: rgba(255,255,255,.26);
  --dps-text: #e7e9ef;
  --dps-soft: rgba(231,233,239,.66);
  --dps-faint: rgba(231,233,239,.44);
  --dps-accent: #8b9bff;
  --dps-on-accent: #10131a;
  --dps-accent-soft: rgba(139,155,255,.14);
  --dps-ok: #3ed68d;
  --dps-ok-soft: rgba(62,214,141,.13);
  --dps-warn: #e3ac42;
  --dps-warn-soft: rgba(227,172,66,.14);
  --dps-err: #f27373;
  --dps-err-soft: rgba(242,115,115,.14);
  --dps-shadow: 0 24px 60px -18px rgba(0,0,0,.7);
}

.dps-root { display: flex; flex-direction: column; gap: 13px; min-width: 0; }
.dps-head { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
.dps-head h3 { margin: 0 0 4px; font-size: 17px; font-weight: 600; }
.dps-head p, .dps-lede { margin: 0; font-size: 13px; opacity: .72; max-width: 62ch; line-height: 1.62; }
.dps-spacer { margin-left: auto; }
.dps-hint { font-size: 11.5px; opacity: .58; line-height: 1.55; }
.dps-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; opacity: .68; }
.dps-trunc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dps-dim { opacity: .5; }

.dps-bar { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; font-size: 12.5px; opacity: .85; }
.dps-input, .dps-mono-input, .dps-editor, .dps-field input, .dps-field textarea {
  font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 6px; color: inherit;
  background: var(--dps-surface);
  border: 1px solid var(--dps-line); }
.dps-input { flex: 1; min-width: 150px; }
.dps-mono-input, .dps-editor { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; width: 100%; }
.dps-editor { min-height: 320px; line-height: 1.7; resize: vertical; }
.dps-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.dps-field label { font-size: 12.5px; font-weight: 500; opacity: .8; }
.dps-field textarea { line-height: 1.6; resize: vertical; }
.dps-input:focus-visible, .dps-mono-input:focus-visible, .dps-editor:focus-visible,
.dps-field input:focus-visible, .dps-field textarea:focus-visible {
  outline: 2px solid var(--dps-accent); outline-offset: -1px; }

.dps-btn { font: inherit; font-size: 12.5px; padding: 5px 12px; border-radius: 6px; cursor: pointer;
  color: inherit; background: transparent; border: 1px solid var(--dps-line-strong); }
.dps-btn:hover:not(:disabled) { background: var(--dps-surface); }
.dps-btn:disabled { opacity: .45; cursor: default; }
.dps-btn.dps-primary { background: var(--dps-accent); border-color: var(--dps-accent); color: var(--dps-on-accent); font-weight: 500; }
.dps-btn:focus-visible, .dps-back:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: 1px; }
.dps-back { border: 0; background: transparent; color: inherit; font: inherit; font-size: 13px;
  opacity: .72; cursor: pointer; padding: 0; align-self: flex-start; }

.dps-switch { display: inline-flex; gap: 2px; padding: 2px; border-radius: 7px;
  border: 1px solid var(--dps-line); }
.dps-switch button { border: 0; background: transparent; font: inherit; font-size: 12px;
  padding: 4px 11px; border-radius: 5px; cursor: pointer; color: inherit; opacity: .66; }
.dps-switch button[aria-selected="true"] { background: var(--dps-raise); opacity: 1; font-weight: 500; }
.dps-switch button:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: 1px; }

.dps-menu { position: relative; }
/* Fixed, not absolute: the settings panel clips its own overflow, and an
   absolutely positioned menu lost its left half to that clip. */
.dps-menu-list { color: var(--dps-text); position: fixed; z-index: 300; min-width: 240px; max-width: min(320px, calc(100vw - 16px)); padding: 5px;
  border-radius: 8px; border: 1px solid var(--dps-line-strong);
  background: var(--dps-bg); box-shadow: var(--dps-shadow); }
.dps-menu-list button { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; white-space: nowrap;
  border: 0; background: transparent; font: inherit; font-size: 13px; color: inherit;
  padding: 7px 9px; border-radius: 5px; cursor: pointer; }
.dps-menu-list button:hover { background: var(--dps-raise); }
.dps-menu-list hr { border: 0; border-top: 1px solid var(--dps-line); margin: 5px 2px; }
.dps-g { width: 14px; text-align: center; opacity: .55; font-family: ui-monospace, monospace; font-size: 11px; flex: none; }

.dps-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dps-table th { text-align: left; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase;
  opacity: .5; font-weight: 500; padding: 0 10px 8px;
  border-bottom: 1px solid var(--dps-line); }
.dps-table td { padding: 9px 10px; border-bottom: 1px solid var(--dps-line); vertical-align: top; }
.dps-table tr.dps-click { cursor: pointer; }
.dps-table tr.dps-click:hover td { background: var(--dps-surface); }
.dps-name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 500; }
.dps-desc { font-size: 11.5px; opacity: .6; margin-top: 2px; line-height: 1.5; max-width: 52ch;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dps-problem { font-size: 11.5px; color: var(--dps-warn); margin-top: 4px; line-height: 1.5; max-width: 56ch; }
.dps-tok { white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dps-tok b { font-weight: 600; font-variant-numeric: tabular-nums; font-size: 13px; }
.dps-tok span { font-size: 10.5px; opacity: .5; margin-left: 3px; }
.dps-tok em { display: block; font-style: normal; font-size: 10.5px; color: var(--dps-ok); margin-top: 1px; }
.dps-tok em.dps-muted { color: var(--dps-faint); }

/* State menu: pick directly instead of cycling. Four states behind one pill
   meant up to three blind clicks to reach the one you wanted. */
.dps-state-wrap { position: relative; display: inline-block; }
.dps-state-menu { position: fixed; z-index: 300; min-width: 260px; max-width: min(340px, calc(100vw - 16px)); padding: 5px;
  border-radius: 8px; border: 1px solid var(--dps-line-strong); background: var(--dps-bg);
  color: var(--dps-text); box-shadow: var(--dps-shadow); }
.dps-state-menu button { display: block; width: 100%; text-align: left; border: 0; background: transparent;
  color: inherit; font: inherit; padding: 7px 9px; border-radius: 5px; cursor: pointer; }
.dps-state-menu button:hover { background: var(--dps-raise); }
.dps-state-menu button[aria-current="true"] { background: var(--dps-raise); }
.dps-state-menu i { font-style: normal; font-family: ui-monospace, monospace; font-size: 11.5px; font-weight: 600; }
.dps-state-menu small { display: block; font-size: 11px; opacity: .6; line-height: 1.5; margin-top: 2px; }
.dps-state { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; font-weight: 500;
  padding: 3px 9px; border-radius: 20px; cursor: pointer; white-space: nowrap; border: 1px solid; background: transparent; }
.dps-state:disabled { opacity: .5; cursor: default; }
.dps-state:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: 2px; }
.dps-s-on { color: var(--dps-ok); border-color: var(--dps-ok); background: var(--dps-ok-soft); }
.dps-s-name { color: var(--dps-warn); border-color: var(--dps-warn); background: var(--dps-warn-soft); }
.dps-s-user { color: var(--dps-accent); border-color: var(--dps-accent); background: var(--dps-accent-soft); }
.dps-s-off { opacity: .6; border-color: var(--dps-line-strong); }

.dps-page { display: flex; align-items: center; gap: 10px; font-size: 12px; opacity: .8; }
.dps-legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 11.5px; opacity: .62; line-height: 1.6; }
.dps-legend i { font-style: normal; font-family: ui-monospace, monospace; font-weight: 600; margin-right: 4px; }

.dps-chip { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; padding: 2px 7px; border-radius: 20px; white-space: nowrap;
  border: 1px solid var(--dps-line-strong); }
.dps-chip.dps-warn { color: var(--dps-warn); border-color: var(--dps-warn); background: var(--dps-warn-soft); }
.dps-chip.dps-ok { color: var(--dps-ok); border-color: var(--dps-ok); background: var(--dps-ok-soft); }
.dps-budget { display: inline-flex; align-items: baseline; gap: 5px; font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; padding: 3px 10px; border-radius: 20px;
  border: 1px solid var(--dps-line); }
.dps-bl { font-size: 9.5px; opacity: .55; }
.dps-budget b { font-weight: 600; font-variant-numeric: tabular-nums; }
.dps-bd { color: var(--dps-ok); font-size: 11px; }

.dps-card { border: 1px solid var(--dps-line); border-radius: 9px; overflow: hidden; }
.dps-card + .dps-card { margin-top: 8px; }
.dps-card-off { border-style: dashed; opacity: .68; }
.dps-row { display: flex; align-items: center; gap: 10px; padding: 11px 13px; }
.dps-grow { flex: 1; min-width: 0; }
.dps-tools { border-top: 1px solid var(--dps-line); }
.dps-tool { display: flex; gap: 10px; align-items: center; padding: 6px 13px 6px 34px; font-size: 12px; }
.dps-tool code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; flex: none; }
.dps-tool > span:not(.dps-ttok) { opacity: .5; font-size: 11.5px; flex: 1; }
.dps-ttok { font-family: ui-monospace, monospace; font-size: 10.5px; opacity: .5; flex: none; font-variant-numeric: tabular-nums; }
.dps-caret { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 2px 4px;
  font-family: ui-monospace, monospace; font-size: 10px; opacity: .6; flex: none; }
.dps-caret:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: 1px; border-radius: 3px; }

.dps-toggle, .dps-tool-toggle { position: relative; border-radius: 11px; flex: none; cursor: pointer; padding: 0;
  border: 1px solid var(--dps-line-strong); background: var(--dps-raise);
  transition: background .15s, border-color .15s; }
.dps-toggle { width: 36px; height: 20px; }
.dps-tool-toggle { width: 28px; height: 16px; }
.dps-toggle::after, .dps-tool-toggle::after { content: ""; position: absolute; top: 2px; left: 2px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.35); transition: transform .15s; }
.dps-toggle::after { width: 14px; height: 14px; }
.dps-tool-toggle::after { width: 10px; height: 10px; top: 2px; }
.dps-toggle[aria-pressed="true"] { background: var(--dps-accent); border-color: var(--dps-accent); }
.dps-toggle[aria-pressed="true"]::after { transform: translateX(16px); background: var(--dps-on-accent); }
.dps-tool-toggle[aria-pressed="true"] { background: var(--dps-ok); border-color: var(--dps-ok); }
.dps-tool-toggle[aria-pressed="true"]::after { transform: translateX(12px); }
.dps-toggle:disabled, .dps-tool-toggle:disabled { opacity: .45; cursor: default; }
.dps-toggle:focus-visible, .dps-tool-toggle:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: 2px; }

/* The tree only earns a column when there is something to choose between.
   A single-file skill used to get a 210px sidebar holding one row while the
   text it was supposed to help you read got squeezed into what was left. */
.dps-detail { display: grid; grid-template-columns: 168px minmax(0, 1fr); gap: 12px; min-height: 300px; }
.dps-detail.dps-solo { grid-template-columns: minmax(0, 1fr); }
.dps-detail.dps-solo .dps-tree { display: none; }
@media (max-width: 720px) { .dps-detail { grid-template-columns: minmax(0, 1fr); } .dps-tree { display: none; } }
.dps-tree { border: 1px solid var(--dps-line); border-radius: 8px; padding: 8px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; overflow: auto; max-height: 440px; }
.dps-tree button { display: block; width: 100%; text-align: left; border: 0; background: transparent;
  color: inherit; font: inherit; padding: 4px 8px; border-radius: 5px; cursor: pointer; opacity: .7;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dps-tree button[aria-current="true"] { background: var(--dps-raise); opacity: 1; font-weight: 500; }
.dps-tree button:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: -1px; }

.dps-pane { border: 1px solid var(--dps-line); border-radius: 8px;
  display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.dps-pane-bar { display: flex; align-items: center; gap: 8px; padding: 5px 10px; font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; opacity: .7;
  border-bottom: 1px solid var(--dps-line); }
.dps-seg { margin-left: auto; display: inline-flex; gap: 2px; padding: 2px; border-radius: 6px;
  border: 1px solid var(--dps-line); }
.dps-seg button { border: 0; background: transparent; padding: 3px 9px; font-family: inherit; border-radius: 4px; cursor: pointer;
  color: inherit; font-size: 11.5px; line-height: 1.3; opacity: .6; font-family: ui-monospace, monospace; }
.dps-seg button[aria-selected="true"] { background: var(--dps-raise); opacity: 1; }
.dps-seg button:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: 1px; }
.dps-pre { background: var(--dps-surface); margin: 0; padding: 13px 15px; overflow: auto; max-height: 440px; font-size: 12px; line-height: 1.65;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }

.dps-err, .dps-warnbox, .dps-okbox { padding: 10px 13px; border-radius: 8px; font-size: 12.5px; line-height: 1.6; }
.dps-err { color: var(--dps-err); border: 1px solid var(--dps-err); background: var(--dps-err-soft); }
.dps-warnbox { color: var(--dps-warn); border: 1px solid var(--dps-warn); background: var(--dps-warn-soft); }
.dps-okbox { color: var(--dps-ok); border: 1px solid var(--dps-ok); background: var(--dps-ok-soft); word-break: break-all; }
.dps-empty { padding: 26px 14px; text-align: center; font-size: 13px; opacity: .58; }

.dps-scrim { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center;
  padding: 24px; background: rgba(0,0,0,.42); }
.dps-modal { width: 100%; max-width: 540px; max-height: 86vh; overflow-y: auto; padding: 20px 22px 0;
  border-radius: 11px; border: 1px solid var(--dps-line-strong);
  background: var(--dps-bg); color: var(--dps-text); box-shadow: var(--dps-shadow);
  display: flex; flex-direction: column; gap: 11px; }
/* The card scrolls and the buttons ride the bottom of it. A repository with
   twenty skills used to push them past the edge of the screen, leaving the
   dialog with no visible way to continue or cancel.
   Flex children shrink by default, so a tall neighbour squeezed the peek row
   and the output box down to a sliver of themselves — inside a scrolling
   column nothing should shrink, it should simply scroll past. */
.dps-modal > * { flex: none; }
.dps-verify { max-height: 44vh; overflow-y: auto; }
.dps-modal .dps-pre { max-height: 34vh; }
.dps-modal.dps-wide { max-width: 760px; }
.dps-modal-head { display: flex; align-items: flex-start; gap: 10px; }
.dps-modal-head h4 { margin: 0; font-size: 16px; font-weight: 600; }
.dps-modal-head p { margin: 5px 0 0; font-size: 12.5px; opacity: .7; line-height: 1.6; }
.dps-x { margin-left: auto; border: 0; background: transparent; color: inherit; opacity: .55;
  font-size: 16px; line-height: 1; cursor: pointer; padding: 2px 4px; flex: none; }
.dps-x:hover { opacity: 1; }
.dps-x:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: 2px; border-radius: 4px; }
.dps-foot { position: sticky; bottom: 0; z-index: 2; display: flex; gap: 8px; justify-content: flex-end;
  flex: none; margin: auto -22px 0; padding: 12px 22px; border-top: 1px solid var(--dps-line);
  background: var(--dps-bg); }

.dps-detect { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 8px 11px; border-radius: 8px;
  font-size: 12.5px; border: 1px solid var(--dps-accent); background: var(--dps-accent-soft); }
.dps-badge { font-family: ui-monospace, monospace; font-size: 9.5px; font-weight: 600; letter-spacing: .06em;
  background: var(--dps-accent); color: var(--dps-on-accent); padding: 2px 6px; border-radius: 3px; }
.dps-peek { border: 1px solid var(--dps-line); border-radius: 8px; overflow: hidden; }
.dps-peek-sum { display: block; width: 100%; text-align: left; border: 0; font: inherit; font-size: 12.5px;
  padding: 7px 11px; cursor: pointer; color: inherit; background: var(--dps-surface); opacity: .82; }
.dps-peek-sum:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: -2px; }

.dps-verify { border: 1px solid var(--dps-line); border-radius: 8px; padding: 11px 13px;
  display: flex; flex-direction: column; gap: 3px; }
.dps-verify > b { font-size: 12.5px; font-weight: 600; margin-bottom: 5px; display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
.dps-vsub { font-weight: 400; opacity: .55; font-size: 11.5px; }
.dps-v { display: flex; gap: 9px; align-items: baseline; font-size: 12.5px; line-height: 1.55; opacity: .82; }
.dps-vi { font-family: ui-monospace, monospace; font-weight: 700; flex: none; }
.dps-v-ok .dps-vi { color: var(--dps-ok); }
.dps-v-bad { opacity: 1; }
.dps-v-bad .dps-vi { color: var(--dps-warn); }
.dps-pick { display: flex; align-items: baseline; gap: 9px; padding: 4px 0; font-size: 12.5px; cursor: pointer; }
.dps-pick input { margin: 0; accent-color: var(--dps-accent); flex: none; }
.dps-pn { font-family: ui-monospace, monospace; font-weight: 500; flex: none; }
.dps-pd { opacity: .55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

.dps-req { font-size: 11.5px; opacity: .62; }
.dps-req > summary { cursor: pointer; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; opacity: .75; padding: 2px 0; }
.dps-req > summary:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: 2px; border-radius: 3px; }
.dps-req[open] > summary { margin-bottom: 6px; }
.dps-btn.dps-tiny { font-size: 11px; padding: 1px 7px; margin-left: 7px; font-weight: 400; }
.dps-req ul { margin: 0; padding-left: 17px; } .dps-req li { margin-bottom: 3px; line-height: 1.6; }
.dps-req code, .dps-hint code { font-family: ui-monospace, monospace; font-size: 11px;
  border: 1px solid var(--dps-line); padding: .5px 4px; border-radius: 3px; }

.dps-drop { display: block; text-align: center; padding: 32px 16px; border-radius: 9px; cursor: pointer;
  font-size: 13px; opacity: .78; border: 1.5px dashed var(--dps-line-strong);
  background: var(--dps-surface); }
.dps-drop:hover { border-color: var(--dps-accent); }
.dps-big { display: block; font-size: 24px; opacity: .5; margin-bottom: 7px; font-family: ui-monospace, monospace; }

.dps-composer { border: 1.5px solid var(--dps-accent); border-radius: 10px; padding: 13px 14px;
  background: var(--dps-accent-soft); }
.dps-composer p { margin: 0; font-size: 13.5px; line-height: 1.6; }

.dps-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.dps-card2 { border: 1px solid var(--dps-line); border-radius: 9px; padding: 12px 14px; }
.dps-card-top { display: flex; align-items: flex-start; gap: 8px; }
.dps-cn { font-family: ui-monospace, monospace; font-size: 13px; font-weight: 500; flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; }
.dps-act { border: 1px solid var(--dps-line-strong); background: transparent; border-radius: 6px;
  width: 24px; height: 24px; cursor: pointer; color: inherit; font-size: 12px; line-height: 1; flex: none; padding: 0; }
.dps-act:hover:not(:disabled) { background: var(--dps-raise); }
.dps-act-on { color: var(--dps-ok); border-color: var(--dps-ok); background: var(--dps-ok-soft); cursor: default; }
.dps-act:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: 1px; }
.dps-cm { font-size: 11px; opacity: .55; font-family: ui-monospace, monospace; margin: 3px 0 6px;
  display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.dps-ver { border: 1px solid var(--dps-accent); color: var(--dps-accent); padding: 0 5px; border-radius: 3px; font-size: 10px; }
.dps-link { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 0; text-align: left; }
.dps-link:hover { text-decoration: underline; }
.dps-link:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: 2px; border-radius: 3px; }
a.dps-btn { text-decoration: none; display: inline-block; }
.dps-topic { cursor: pointer; font-family: inherit; }
.dps-topic-on { background: var(--dps-accent); border-color: var(--dps-accent); color: var(--dps-on-accent); }
.dps-topic:focus-visible { outline: 2px solid var(--dps-accent); outline-offset: 1px; }
.dps-cd { font-size: 12px; opacity: .72; line-height: 1.55;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* code-plugin tab */
.dps-body { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px 12px;
  border-top: 1px solid var(--dps-line); }
.dps-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.dps-btn.dps-danger { border-color: var(--dps-bad); color: var(--dps-bad); }
.dps-btn.dps-danger:hover:not(:disabled) { background: var(--dps-bad-bg); }
.dps-count { font-size: 12.5px; opacity: .75; padding: 2px 0; }
.dps-log { margin: 0; font-family: var(--dps-mono); font-size: 11.5px; line-height: 1.55;
  background: var(--dps-surface); border: 1px solid var(--dps-line); border-radius: 8px;
  padding: 9px 11px; max-height: 190px; overflow: auto; white-space: pre-wrap; }

@media (prefers-reduced-motion: reduce) { .dps-root *, .dps-modal * { transition: none !important; } }
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
