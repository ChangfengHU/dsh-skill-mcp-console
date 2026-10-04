# dsh-runtime-source-binding - Verify the package actually loaded

## Problem
Updating a plugin checkout can leave the running DSH loading an older copy under
its profile node_modules. A source-only grep passes while the new RPC returns 404.
Native dependencies can also prevent the next restart even if the old process was healthy.

## Decision Method
Compare package.json version and compiled lib/index.js at both source and profile
paths. Check session.list before restarting. After deployment, call the new RPC and
open the actual browser page. On macOS, load better-sqlite3 using the launchd Node
binary before restart; rebuild under that binary if NODE_MODULE_VERSION differs.
Preserve databases and credentials. Never treat a copy, a menu or a passing unit
test as proof that the installation and authorization chain work.

## Evidence And Reasoning
The Apps source contained inspectCatalogApp while the installed package did not.
Replacing the installed package removed the 404. Rebuilding SQLite under the
launchd Node restored local startup. The new preview then correctly exposed an
independent Fleet publisher-metadata failure rather than claiming readiness.
Operational snapshots and verification counts live in dev-log/2026-10-04.md.

## Related
For installation polling disconnects, compare the job file timestamp with the
macOS DiagnosticReports crash time and launchd PID/exit status. A persisted running
record after process death is not a live task. Mark it interrupted on read; never
infer success from the preceding progress stage. Serialize atomic snapshots and
retain the browser job id during transient transport failures.

When the crash frames show V8 JIT allocation/Turbofan finalization, test targeted
--no-opt --no-maglev --no-sparkplug as a Mac-only workaround. Verify real HTTP,
native SQLite, session preservation and all plugin tests before calling it usable.
Do not use --jitless blindly: Node Undici may require WebAssembly. Keep the crash
report; no claim that the underlying Node/protection interaction is conclusively
diagnosed. Revisit flags after runtime or endpoint protection updates.

For App preflight 503, inspect Fleet's upstream status before changing the UI.
GitHub anonymous API rejection can affect both grant metadata and update checks.
Use the existing server Vault credential only at api.github.com; never forward it
to raw content hosts or clients. Public release metadata is not an install grant.
Verify the actual user tab: check updates, open the App and reach a real permission
preview. Stop before final install unless that consequential action is authorized.

[[app-release-contracts]] explains publisher installer parsing and update ownership.
The workspace convention is in .brain/CONVENTIONS.md and ../AGENTS.md.

## Date And Expiry
Local MCP disabled flags are connection opt-outs, not Fleet capability publication
status. App installation preserves existing disabled configs even without headers,
skips their network probe and reports a nonblocking yellow warning. Never present
this as a successful connection or require enabling it to register the App.
Enabled MCP connection/authentication failures still surface honestly. Acceptance
must distinguish installed App, available Skills, enabled local MCP connections,
and actually verified connectivity. Plugin 1.5.8 passed a real installation with
32 Skills, seven successful MCP probes and one preserved disabled warning.

2026-10-04. Revisit if DSH eliminates profile package copies, changes its loader,
or the supervised Node runtime changes. Risk: high for deployment verification.
