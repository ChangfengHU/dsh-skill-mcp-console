# Handoff

## Runtime
- Source: /home/claude/dsh-skill-mcp-console
- Loaded package: /home/claude/.dsh/profiles/web/node_modules/dsh-skill-mcp-console
- Service: sop-dsh-web.service
- Local workspace: /Users/changfeng.hu/code/js/dsh-extensions
- UI: https://dsh.vyibc.com/ and http://localhost:3080/ -> Settings -> Apps

## App Import Contract
The manual import adapter strictly parses supported publisher commands, never
executes arbitrary Shell. Previews pin an exact repository revision and keep
credentials server-side in a short-lived entry; install accepts only its preview
id. Unknown publishers need explicit adapters and endpoint allowlists.

Catalog installation and installed App update previews both obtain package-bound
Fleet authorization automatically through the existing trusted connection. They
show a permission preview before any content/configuration changes. The public
Fleet release route returns pinned metadata only, no bootstrap or broad token.
GitHub metadata uses Fleet's existing service:github Vault credential server-side
only at api.github.com, not raw content hosts. DSH uses this public metadata when
anonymous GitHub release checks fail. Do not remove this fallback on source sync.

Other-source Skill conflicts require explicit consent. Preserve disabled MCPs,
sessions, tasks, agents, credentials and machine-local configuration. Backups live
under ~/.dsh/app-backups. Verify source AND actual profile package after updates.
Run tests and build before deploying; Mac native SQLite must match launchd Node.
Use the existing local proxy for GitHub; localhost and vyibc endpoints stay direct.

## Acceptance Boundary
Version checks and real local permission preview were verified on 2026-10-04.
Final content installation and MCP connectivity were not executed or accepted.
See dev-log/2026-10-04.md and evidence.jsonl for commits and verification.
