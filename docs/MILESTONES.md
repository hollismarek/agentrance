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

Ollama HTTP with qwen3:4b and agent-directed read-only repository exploration, polished provider/session configuration and final desktop packaging remain separate milestones. reqwest and futures-util are reserved for Ollama. Packaging is disabled during development (bundle.active=false). Agent Desk does not store provider authentication or add application telemetry.

## UI resilience and configuration follow-up

Implemented after provider review: separate sidebar, session pane, composer, provider settings, and session orchestration; local error boundaries around activity, individual conversations, and the app. Optional malformed tool metadata is handled defensively. Fresh provider defaults resolve the runtime launch directory (the project root under the Tauri development runner), rather than a developer-specific path. Existing valid saved configuration is retained. Invalid saved JSON is reported without overwriting it; saving settings validates fields, unique IDs, argument lists, environment values, and absolute paths. Session startup also checks the directory exists.

The SQLite mutex now covers persistence only. Event sequence numbers are merged and deduplicated on the frontend, preserving stored order if concurrent IPC emissions arrive out of order. Startup history replay and buffering retain activity emitted before session creation returns. Compare creation failures leave successful sessions visible and usable.

Validation: 15 activity cases, 4 provider/event-order cases, 2 Rust storage tests, TypeScript compilation, and a Vite production build pass. Browser automation remains skipped. Provider authentication, tool permission policy, and development packaging settings are unchanged.

## Continue saved conversations

Saved history now offers **Continue conversation**. New chats persist the provider configuration ID and ACP session ID, plus their existing project directory, in SQLite. Continuing launches the matching configured CLI using its existing authentication and the original project root. It prefers advertised `session/resume` support and otherwise uses advertised `session/load`; providers without either capability leave history readable and report the limitation. No fresh conversation is silently substituted if restoration fails or the provider has removed its session.

For older chats, migration recovers an ACP session ID only when saved permission requests for that local conversation contain exactly one distinct nonempty session ID. Chats without that evidence remain read-only. Legacy provider names must match one current configuration unambiguously; new chats match the stable configuration ID. Executable arguments, environment overrides, and authentication data are not copied into the history database.

`session/load` replay notifications do not duplicate the locally saved transcript/activity. Reconnection creates a lifecycle boundary that expires old permissions; request numbers reused by later provider processes cannot resolve old approval records. Closing a connection kills its process without deleting the conversation. Comparisons still start fresh sessions.

Validation: scripted ACP subprocess tests cover load/resume capability negotiation, exact saved session IDs and original roots, transcript replay suppression, separate sessions, continued streaming, and shutdown. SQLite migration tests cover recoverable, ambiguous, and missing legacy IDs. Frontend tests cover provider matching, connection lifecycle ordering, and stale permissions across reconnects. Live Kiro continuation still needs a hands-on check in the Tauri app.

## History labels and cleanup

History entries, open tabs, and conversation headers now use a one-line preview of the first user prompt instead of Agent Desk's internal UUID. Titles are derived locally for existing chats too, without sending content to a model. Entries show provider, project, and last recorded activity, and are ordered by that activity. The per-entry options button offers Rename (a persistent custom title) and Delete chat.

Deletion requires confirmation in the app, removes the local session and activity rows in a single SQLite transaction, and closes any idle connection. Running or reconnecting conversations cannot be deleted until stopped/finished. The provider's independently saved session is not deleted. Late provider notifications and in-flight UI refreshes cannot repopulate a deleted local conversation. Closing a tab still only closes its connection; it keeps history.

Validation: summary derivation for old/new chats, persistent rename, Unicode truncation, deletion isolation/idempotence, and transaction rollback tests pass alongside the existing tests (22 frontend cases, 7 Rust tests). TypeScript, Rust, and production frontend build checks pass. Browser automation remains skipped as previously agreed.
