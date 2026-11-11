# Agent Desk milestones

## Activity inspector

Implemented: a collapsible inspector per conversation; operation patches merged by ACP toolCallId; provider-reported commands, output, exit codes, permissions, state, and observed elapsed time. Expand operations for snapshots and original event history. Permission controls send only explicit user decisions. Unknown output and timing remain labelled unknown. Provider stderr is not command stderr and is not presented as command output. No terminal execution capability was added.

SQLite stores activity and permission events with timestamps; existing rows remain readable without fabricated timing. A turn ending without a final tool result is shown as “No final result.” Historical permission requests cannot be approved.

Validation: activity reducer tests, database migration/replay tests, TypeScript compilation, and Rust checks pass. Automated browser verification was skipped at the user's request; tests/activity-preview.html and tests/activity-browser.mjs provide an optional local fixture. The user has tried the Tauri app directly. Actual output visibility and timing depend on the provider's ACP reports.

## Next: repository inspection workspace (planned)

1. **Project file browser:** lazy directory listing rooted in each session's configured project. Canonicalize paths and enforce containment, including symlinks. Respect hidden/ignored paths by default, with explicit visibility settings. Directory entries remain display data; selecting a file never executes it.
2. **Read-only code viewer:** file tabs with syntax highlighting, line numbers, search, and bounded reads. Handle binary, large, missing, and non-UTF-8 files explicitly. Open tool-reported locations only after root validation; require an explicit choice for files outside the project. No save/edit commands.
3. **Diff viewer:** unified/side-by-side read-only comparison of ACP diff content and explicitly requested local Git changes. Distinguish provider-proposed changes from filesystem changes, mark stale snapshots, and link validated paths back to the code viewer. No apply, stage, or revert actions.

Use the existing single window: collapsible project sidebar, conversation area, and a resizable inspection area; retain per-session project context in split panes. Test containment and symlink escapes, large/binary files, line navigation, diff additions/deletions, and independent pane selection before committing this milestone.

## Remaining original v0.1 scope

Ollama HTTP with qwen3:4b and agent-directed read-only repository exploration, polished provider/session configuration, resumable conversation behavior where supported, and final desktop packaging remain separate milestones. reqwest and futures-util are reserved for Ollama. Packaging is disabled during development (bundle.active=false). Agent Desk does not store provider authentication or add application telemetry.
