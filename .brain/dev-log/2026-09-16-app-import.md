# App import and installation

Implemented the first real Apps workflow in `dsh-skill-mcp-console`.

## Outcome

- Added a top-level Apps section and the Apps tab in the existing Workbench.
- Added strict parsing for the publisher's install command; arbitrary shell
  chaining, unknown hosts and mismatched release paths are rejected.
- Preview resolves the trusted installer contract, pins the GitHub commit, and
  displays the real package composition before any installation occurs.
- Confirmation uses a short-lived host-side preview id. The bootstrap value is
  neither returned to the browser nor included in logs or repository files.
- Installation uses structured `codex` argv calls and probes each declared MCP;
  it never evaluates the pasted command.

## Verification

- Node test suite: 35 passing, zero skipped.
- Production build completed for host, Typert and client bundles.
- Direct preview against the current public release returned version 0.7.2,
  29 Skills and 8 MCP declarations, with no credential in the public payload.
- Browser acceptance on the public DSH showed the Apps entry and real preview
  without page errors; the command input was cleared after preview.

The final real install remains a user confirmation step in the UI because the
credential must not be copied into terminal history or development logs.
