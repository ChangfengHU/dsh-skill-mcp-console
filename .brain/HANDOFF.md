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

DSH installation registers only DSH; it must not silently install Codex plugins.
Restored running job files represent interrupted work, not success. Re-preflight
after interruption rather than submitting a consumed preview twice.
The Mac launch settings are ~/Library/LaunchAgents/com.vyibc.dsh3080.plist.
Preserve its targeted V8 workaround (--no-opt --no-maglev --no-sparkplug) when
syncing, unless real crash/HTTP tests justify removing it. Do not use --jitless:
Node's HTTP parser can need WebAssembly. See wiki/dsh-runtime-source-binding.md.

## Acceptance Boundary
Disabled local MCP dependencies do not block App installation. Preserve their
opt-out and show an explicit untested warning; do not conflate it with Fleet's
published availability or claim the dependency works locally. Enabled connection
failures remain genuine failures. The 1.5.8 real installation passed with seven
MCP probes and a preserved disabled behavior warning.

Read App receipts and app-jobs together with the actual browser report to verify
install completion; file presence and completed progress stages are insufficient.
See dev-log and evidence.jsonl for current test and installation acceptance.
