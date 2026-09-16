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
- Production profile `web` currently loads package version 1.1.2.

## Next action

Have the user paste a fresh command into Settings → Apps and confirm the real
install. Verify Codex reports the App enabled and each declared MCP connection
passes its post-install check.
