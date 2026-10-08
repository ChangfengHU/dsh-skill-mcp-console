# 2026-10-08 — Apps catalogue isolation and Fleet capability batch installation

## Delivered

- Apps catalogue rows without a DSH repository/revision/installer now remain
  visible as incompatible instead of rejecting the entire catalogue. Explicit
  unsafe repository URLs, duplicate identities and invalid revisions still fail.
  Independent Apps/Skills/MCP requests use allSettled so one failure does not
  erase the other sections. Source commit `853a333` was pushed before rollout.
- Fleet selected Skill/MCP IDs open a two-phase DSH preview/confirmation. Full
  reviewed Skill trees, required MCP dependencies and per-file digests are
  verified; no remote shell or credentials enter the handoff URL. Package-only
  selections retain their owning App. Source commit `74cf799` was pushed.
- Existing Skill trees, independent MCP authorization and disabled state are
  retained by default. Explicit replacement makes a recoverable backup.
  OAuth needs the actual owner's connection; a failed MCP check is partial,
  not a successful connection. New native registrations may require a separate
  runtime reload; installation does not interrupt running Sessions automatically.

## Production evidence

- Host full suite: 73/73. Fleet adapter/deployment checks: 10/10; independent
  Harness/publication regression checks: 9/9. Diff whitespace checks and builds
  pass. Tests add no production dependencies.
- Service source resolves from profile web to the 1.6.3 package, not the source
  worktree. Packaged/source lib/index.js SHA256:
  `06488b9a3cd14ea30846ca938883d59db0e8eb79b8e5fe357a984dfb325f34d6`.
  Existing shared node_modules was linked, not reinstalled. Native Sessions and
  Task running claims were both zero before service restart.
- Real Apps RPC: HTTP200, ok:true, four rows including installed Flow and cartoon
  packages. Real Chrome opens Apps/batch preview without errors at 1440/390px.
- The actual Fleet page selected harness-capability-acceptance and vyibc-image,
  produced exactly those handoff IDs, and DSH confirmation was clicked once.
  End-to-end browser acceptance: 37.10s, zero page errors, zero Agent or Task
  starts, no paid generation. The separate direct preview check took 46.04s;
  these are page-start/test timings, not media generation performance claims.
- Receipt:
  `/home/claude/.dsh/capability-installs/1c748b5e-8cd4-4a6f-826e-604b20c417b6.json`.
  status=installed; complete three-file Skill hash readback passes; effective
  existing vyibc-image connection passes initialize/tools/list with four tools.
  Preview and receipt contain no credential values.

## Boundaries still open

- This does not complete App-owned Agent creation, portable Action parameters
  or Harness private Personal Trace authorization. Those remain separate work.
- Published large cartoon-xiaban archive exceeds the existing reviewed Skill
  reader's size limit. The versioned character-design installer publishes a
  tar.gz contract rather than the supported ZIP contract. Both reject during
  preflight; neither was truncated or falsely reported installed. A future
  format adapter must retain full assets and preserve strict path/hash checks.
- Boss/Harness-only catalogue visibility is not proof of DSH install support.

## Cleanup / recovery

Removed the three byte-identical files and then empty directory
`/tmp/fleet-capability-batch-deploy-wampXZ`, releasing 6,508,486 bytes. Exact
SHA comparison proved recovery from `/tmp/fleet-capability-batch-deploy-uFxuyw`.
Keep the latter during rollout observation; review/remove it after rollback is
no longer required. Production package, referenced shared dependencies and the
previous package remain needed runtime/rollback inputs, not disposable caches.
