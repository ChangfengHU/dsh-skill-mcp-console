# Tasks

## Apps installation

- [x] Parse the supported publisher command without invoking a shell.
- [x] Read installer contract and pinned plugin manifest/tree.
- [x] Show Skills, MCP, instructions, Hooks, permissions and source before install.
- [x] Keep bootstrap credentials server-side and remove them from the UI after preview.
- [x] Require an explicit confirmation and verify App/MCP state after installation.
- [x] Adapt installed Skills and MCP servers into DSH-native roots and reload the supervised host.
- [x] Deploy and browser-test the Apps page on the `web` profile.
- [ ] Complete one user-confirmed real install with a fresh bootstrap credential.

t-1 Fleet published Apps are visible and detail text remains readable inside Settings done
t-2 Flow and Boss Brain have verified DSH release/grant/install adapters active
t-2a Flow portable adapter, permission preview and real page install done
t-2b Boss Brain adapter remains separate; catalog visibility is not installation support active
t-3 Mac modelConsole snapshot survives repeated calls without process death active

## 2026-10-08 — Generic Fleet batch installation

- [x] Isolate catalogue-only/non-DSH publications; retain their visible compatibility reasons without breaking all Apps.
- [x] Fleet library multi-selection → DSH preflight/explicit batch confirmation → full Skill tree and required MCP installation receipts.
- [x] Reuse independent credentials/disabled state; verify effective MCP initialize/tools/list; no Agent/Task/media starts in acceptance.
- [x] Publish and read back 1.6.3 from actual web-profile package; real Fleet/DSH page click passes desktop and narrow viewports.
- [ ] Support legacy tar.gz character-design and the oversized cartoon-xiaban Skill archive without dropping assets or weakening source checks.
- [ ] Complete generic App-owned Agent/portable Action lifecycle and Flow preset binding. This batch feature is not that acceptance.

Evidence: dev-log/2026-10-08-fleet-batch.md.
