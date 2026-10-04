# Handoff

## Runtime

- Source: `/home/claude/dsh-skill-mcp-console`
- DSH profile: `/home/claude/.dsh/profiles/web`
- User service: `sop-dsh-web.service`
- Public UI: `https://dsh.vyibc.com/` → Settings → Apps

## App import contract

The browser sends the pasted command once to `inspectApp`. The host strictly
parses the publisher URL and bootstrap parameter, reads the installer contract,
pins the marketplace repository SHA, and stores the credential only in an
in-memory preview entry for ten minutes. The client receives no credential and
clears its input after preview. `installApp` accepts only that preview id.

Do not weaken this into arbitrary shell execution. New publishers require an
explicit adapter and allowlisted endpoints. Operational MCP credentials may be
written only by the supported configuration adapter or publisher credential
exchange; never place them in Git, logs, documentation or API responses.

Installed Apps use checkAppUpdates and previewAppUpdate; the latter reuses
existing MCP configuration, while newly missing endpoints need a fresh signed
command. Skill conflicts outside App ownership require explicit overwrite
consent. Backups live under ~/.dsh/app-backups. Run the Node test suite and build
before deploying; the local Mac must use its existing proxy for GitHub while
localhost and vyibc endpoints remain direct.
