# app-release-contracts — Do not mistake parser failure for an unsupported App

## Problem
A publisher can keep the same installation command while replacing the script's internal declarations. A parser tied to one shell variable then rejects a perfectly valid release. Hardcoded catalog versions hide updates independently of this failure.

## Decision
Use Settings > Apps > Check updates to compare the pinned upstream revision with the installation receipt. A failed check is not evidence that the installed release is latest. Use the Update preview to reuse the current MCP configuration, or import a new signed command when dependencies are missing.

Parse bounded literal declarations only. Never execute the pasted script to discover its behavior. Bootstrap tokens expire and are not permanent update credentials. The existing credentials are reused only for existing endpoints; new endpoints require the publisher's credential exchange.

## Ownership
App-owned Skills may be backed up and replaced. Another source's same-name Skill requires an explicit checkbox. Download all files before changing live directories. Preserve disabled MCP settings and public endpoints' authentication policy; a missing header alone does not prove a broken endpoint.

## Evidence
See src/app-contract.ts, src/apps.ts, test/app-contract.test.ts and test/app-update.test.ts. Run the full Node test suite and the build. Compare actual publisher manifest/tree data, not installer comments or cached catalog strings. Receipt absence means that DSH has not registered a completed installation, even if some Skill files exist.

## Related
[App import contract](../HANDOFF.md) and the installed-update tests are the verification anchors.

## Expiry
Recorded 2026-10-04. Revisit when the publisher adopts a structured release manifest, changes credential response schema, or the host gains transactional runtime reload. Risk: medium; declarations are bounded adapters rather than arbitrary script interpretation.

See [[published-apps-and-install-grants]] for the boundary between catalog
publication and an audited installation adapter.
