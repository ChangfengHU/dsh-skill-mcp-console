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
For App preflight 503, inspect Fleet's upstream status before changing the UI.
GitHub anonymous API rejection can affect both grant metadata and update checks.
Use the existing server Vault credential only at api.github.com; never forward it
to raw content hosts or clients. Public release metadata is not an install grant.
Verify the actual user tab: check updates, open the App and reach a real permission
preview. Stop before final install unless that consequential action is authorized.

[[app-release-contracts]] explains publisher installer parsing and update ownership.
The workspace convention is in .brain/CONVENTIONS.md and ../AGENTS.md.

## Date And Expiry
2026-10-04. Revisit if DSH eliminates profile package copies, changes its loader,
or the supervised Node runtime changes. Risk: high for deployment verification.
