# App import and installation

## 1.2.0 Apps product surface

- Replaced the import-only panel with the approved catalog/detail interaction.
- Added live installed/enabled state, Skill/MCP runtime joins, prompt insertion,
  update-aware confirmation, enable/disable, and recoverable uninstall.
- Catalog rendering is local and immediate; a fresh signed import remains the
  authority for exact release contents and credentials remain host-memory only.

## 1.2.1 preview fidelity

- Parse the publisher's real `command-support/catalog.json` instead of only
  guessing `commands/` and `instructions/` directory conventions.
- Show expandable Skills, MCP, commands and Hooks with command descriptions in
  the confirmation dialog. Browser acceptance verified 29/8/9/0 and confirmed
  that the submitted credential is absent from the DOM.

## 1.3.0 observable installation

- Replaced the long blocking browser RPC with a background host job and status
  polling, exposing actual Skill and per-MCP progress in the confirmation UI.
- Corrected MCP state labels: configured, disabled, runtime phase and actual
  registered tool counts are separate facts; missing entries say unconfigured.
- Diagnosis of the first user attempt found no receipt, no installed Skills and
  seven missing MCP entries, proving that attempt did not complete.

## 1.4.2 visual integration and recovery

- Reworked the existing Apps content area without changing DSH navigation:
  layered surfaces, stronger hierarchy, responsive detail layout and dark mode.
- Added four visible installation stages, persisted job snapshots and session
  recovery after refresh; no credential is written into those snapshots.
- MCP rows now distinguish App-managed connections from reused environment
  entries and report runtime/tool evidence separately.
- Screenshot acceptance covered light and dark desktop plus 390px responsive
  layout with zero document horizontal overflow and no page errors.

## 1.5.0 capability state integrity

- Replaced repetitive Skill labels with an aggregate 4-way summary and
  per-row ownership/state chips: App managed, environment reused and missing.
- Installation now writes a successful receipt only after every declared MCP
  and Codex registration check passes. Partial installs retain failed ownership
  state so a retry can repair them without misreporting success.
- Browser screenshot acceptance verified the 0/29 initial state, summary and
  all rows in dark theme with no page errors or horizontal overflow.

## 1.5.1 independent Skill reuse

- Diagnosed the first real install failure at 0/29: an independently installed
  `vyibc-character-design` collided with the App declaration.
- The installer now preserves and reuses independent same-name Skills, installs
  only missing/App-owned entries, and records ownership separately so disable
  or uninstall cannot touch reused capabilities.

Implemented the first real Apps workflow in `dsh-skill-mcp-console`.

## Outcome

- Added a top-level Apps section and the Apps tab in the existing Workbench.
- Added strict parsing for the publisher's install command; arbitrary shell
  chaining, unknown hosts and mismatched release paths are rejected.
- Preview resolves the trusted installer contract, pins the GitHub commit, and
  displays the real package composition before any installation occurs.
- Confirmation uses a short-lived host-side preview id. The bootstrap value is
  neither returned to the browser nor included in logs or repository files.
- Installation uses structured `codex` argv calls and probes each declared MCP;
  it never evaluates the pasted command.
- The same package is adapted into DSH-native capability storage: Skills are
  installed under the native user root, MCP entries are merged into the active
  profile, and an ownership receipt prevents overwriting independent Skills.
  The loader exits only after returning the result so the supervised host can
  restart with the new registry.

## Verification

- Node test suite: 35 passing, zero skipped.
- Production build completed for host, Typert and client bundles.
- Direct preview against the current public release returned version 0.7.2,
  29 Skills and 8 MCP declarations, with no credential in the public payload.
- Browser acceptance on the public DSH showed the Apps entry and real preview
  without page errors; the command input was cleared after preview.

The final real install remains a user confirmation step in the UI because the
credential must not be copied into terminal history or development logs.
## 1.5.2 real install recovery

- Fixed Skill installation progress so every completed Skill advances the
  visible numerator; reused independent Skills count immediately.
- MCP acceptance now probes the effective DSH configuration. Optional Codex
  Plugin CLI support is reported separately and cannot turn a usable DSH App
  into a failed install.
- Deployed the corresponding Fleet bridge correction and verified all eight
  declared MCPs with both initialize and `tools/list` (83 tools total).
- Recovered the retained 0.7.2 install without asking for another bootstrap
  credential: 28 managed Skills, one reused Skill, eight connected MCPs.
- `npm test`, build, package install, DSH restart, public browser load and the
  persisted installed receipt all passed. No credential entered source, logs,
  browser responses or Git.
