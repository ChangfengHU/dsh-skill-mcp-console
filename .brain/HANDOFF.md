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
written only by the supported CLI configuration step; never place them in Git,
logs, documentation or API responses.
