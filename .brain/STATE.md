# Project state

## Verified inventory

- GitHub repository: `ChangfengHU/dsh-skill-mcp-console`
- The plugin owns top-level Apps, Skills and MCP settings sections.
- Apps imports use a strict two-step inspect/confirm flow. The first supported
  publisher format is the signed `skill.vyibc.com/<app>/release/install-<app>.sh`
  command.
- App preview reads and pins the public GitHub release commit, exposes package
  contents without returning the bootstrap credential, and keeps confirmation
  state in host memory for ten minutes.
- Production profile `web` loads package version 1.5.2. Apps includes a
  catalog, six-tab detail view, live Skill/MCP state, lifecycle management and
  a fill-current-session action.
- App command discovery follows the package's `command-support/catalog.json`
  contract; the first real package exposes nine command entries.
- App installation runs as a polled host job with visible Skill, MCP, Codex
  and completion stages. MCP detail distinguishes configuration from runtime
  registration and never labels an unverified connection healthy.
- Apps uses distinct page, surface and card layers in both themes; installation
  has a four-stage UI, persisted job snapshots and browser-session recovery.
- App Skill detail distinguishes App-managed, environment-reused, disabled
  and missing capabilities. Failed MCP/Codex acceptance no longer creates a
  successful receipt; it records a retryable failed state.
- Independent same-name Skills are preserved and reused instead of aborting the
  whole App. Receipts separately track declared Skills and App-owned Skills so
  lifecycle actions never modify reused environment capabilities.
- Skill installation reports per-Skill progress instead of remaining at zero
  for the entire download. DSH MCP acceptance uses each effective configured
  endpoint and is independent of optional Codex Plugin CLI support.
- `cartoon-video-studio` 0.7.2 is installed: 28 App-managed Skills, one reused
  independent Skill, and all eight declared MCPs passed initialize and
  `tools/list` acceptance through the signed bridge.

## Next action

Expose the already collected MCP tool names and descriptions in an expandable
App detail row if the owner wants deeper capability inspection.
