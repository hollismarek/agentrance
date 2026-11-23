# Continuing development in Agentrance

Repository: use the root of your local clone (the checkout directory may still
be named `agent-desk`).
Use the installed Stable Agentrance to talk to Codex. Set its provider working
directory to this repository. Run `npm run tauri dev` separately to test changes.
Development restarts must not interrupt the Stable app's coding conversation.

## Product direction

A local-first, cross-platform Tauri 2 / React / Rust workspace for independent
coding-agent sessions. Kiro CLI V3 and generic ACP providers work; Codex via
`codex-acp` has been tested by the user. Existing CLI authentication stays with
each provider. No app telemetry or credential management. Permissions require
explicit user decisions; never auto-approve or weaken provider policy.

Working features: streamed chat and activity, explicit approvals, agent/model
choices when advertised, SQLite history/resume/rename/delete, copy Q&A, central
Help, independent drafts/composers, up to four adaptive tabbed panes, and
OS-following light/dark appearance. Two-pane layouts retain a resizable divider.
Compare can start fresh sessions or send to selected connected conversations. Stable and Development have separate
identities, history and provider settings. See scripts/README.md for builds,
local snapshot installation and rollback; docs/MILESTONES.md records decisions.

Workspace tabs/layout and text drafts now recover from channel-local
workspace.json. Restored chats remain disconnected until Continue conversation.
Attachment bytes are not persisted; restored drafts show names to reattach.
New sessions confirm a project folder; Compare uses one explicitly selected
folder for every provider. Recent choices recover with the workspace; saved
provider defaults and original roots for resumed conversations are preserved.
Native Browse is available in project dialogs; validation failures retain the
dialog and Compare input. Conversation reading positions survive tab/pane
switches in memory, and first opens start at the bottom. Normal window close and
app quit flush recovery before exiting; save failures keep the app open with an
explicit Quit without saving option. Menu → Backup & Restore exports local
history, provider settings, and workspace recovery. Restore stages a separate
profile for the next launch and preserves the previous profile.
Menu → Open provider session lists and opens existing sessions from ACP
providers that advertise listing and loading. Agent and model choices are
saved per conversation and restored on Continue, with the agent applied first.
Waiting tabs now show an approval-count badge based on the same live-request
reducer as approval cards. Drafts clear only after a correlated backend
acknowledgment that the prompt is recorded. Quit/save failures appear in a
separate topmost dialog with Retry, Keep working and Quit without saving.

Ollama HTTP is NOT implemented. It remains a planned milestone with qwen3:4b
and agent-directed read-only repository exploration. Project file browser,
syntax-highlighted read-only viewer and diff viewer are later milestones.
Keep the UI usable at each stage; save the comprehensive polish pass for later.

## Engineering workflow

Inspect the current code and Git status; do not assume this document is newer
than the implementation. Implement testable milestones and commit each one.
Keep ACP permission behavior intact. Preserve source/provider IDs, event order,
late-event deletion guards and independent session state. Do not run an agent
against live user conversations just to force a timeout or startup failure.
Use fake subprocesses and isolated temporary directories for failure tests.

Checks:

```sh
npm test
npm run build
cargo check --offline --manifest-path src-tauri/Cargo.toml
cargo test --offline --manifest-path src-tauri/Cargo.toml
python3 tests/desktop_test.py
python3 tests/install_local_test.py
```

Native UI interactions are checked by the user. Browser automation/downloads
were deferred. Windows/macOS runtime and packaging still need validation on
those operating systems. CLI processes may handle their own telemetry/networking.


Platform preparation is implemented, not yet native-validated on macOS/Windows.
See scripts/README.md for executable lookup, Windows npm-adapter configuration,
first-run project setup, clipboard behavior and portable Python test selection.
.github/workflows/check.yml will run platform checks after the repository is
pushed to GitHub; no installers or releases are published by that workflow.

Settings now uses provider forms and contains Appearance. On startup, filesystem
metadata discovery checks for Kiro CLI and Codex ACP launchers (not plain Codex).
Fresh configurations are prefilled; existing saved providers are retained, with
discoveries offered as additions. No provider runs during discovery. See the
latest milestone for search limits and native verification still needed.
