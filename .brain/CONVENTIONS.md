# DSH Development Workspace

This conversation concerns DSH and its plugins. Work from
/Users/changfeng.hu/code/js/dsh-extensions, not mastra-study.
Do not repeatedly ask the user to select the project unless they change scope.
See ../AGENTS.md for the workspace scope and remote/local boundaries.

Remote95 main is the source of truth. Synchronize approved code through R2;
do not use Git remote commands on the local Mac. Preserve machine-local settings,
credentials, sessions, tasks and unrelated Skills/MCP entries.

Deployment must verify the profile's actually installed plugin files. Updating a
source checkout is not sufficient. Before restarting, check active sessions.
Rebuild better-sqlite3 with the Node binary used by launchd if its ABI differs.
Use real UI/RPC verification; a passing test suite is not installation acceptance.
