# published-apps-and-install-grants - Discovery Is Not Installation Authorization

## Problem
An Apps page may show only one package even when Fleet publishes several. A
package list, a configured MCP and an authorized install are different facts.
Treating discovery as authorization leads to broken install buttons or running
unverified publisher shell commands.

## Decision Method
Read Fleet's public registry and compare its plugin IDs with skillMcp/apps.
Validate unique IDs, fixed source revisions and repository identities before
projection. An authoritative empty catalog must remain empty; network failure
must not silently become a fabricated single-package fallback.

Next inspect the publisher release/grant contract for each package. Only enable
installation after its manifest layout, pinned files, credentials and declared
permissions can be preflighted. Preserve existing machine-local receipt/config
state independently of published metadata. Unsupported adapters should be
explicit and excluded from the installable filter.

## Evidence And Reasoning
The previous DSH public list and Fleet grant service both assumed Cartoon Video
Studio. Fleet's existing registry already listed Flow and Boss Brain as well.
Using that registry fixed discovery without introducing another remote endpoint.
Those other installers have different layouts and behavior, so a generic button
that merely executes their shell commands would not be the existing audited
DSH installation mechanism. The business commit and acceptance snapshots are
recorded in dev-log/2026-10-05.md.

For layout, use the Settings panel width as the breakpoint. A wide desktop can
still have a narrow panel; action buttons must not reduce the text column to a
single character. Give actions their own row and use container-width rules.

## Related
[[app-release-contracts]] covers installer parsing and ownership preservation.
[[dsh-runtime-source-binding]] covers loaded-package and service verification.

## Date And Expiry
2026-10-05. Revisit when Fleet publishes a unified installation contract or DSH
changes its package loader. Risk: high for authorization, medium for discovery.
