# Agentrance

A local desktop workspace for independent coding-agent conversations, built with
Tauri 2, React, TypeScript, and Rust. Connect existing agent CLIs through the
Agent Client Protocol (ACP), compare their responses, and inspect their activity
and permission requests in one window.

Agentrance was previously called Agent Desk. Internal executable names and app
identifiers retain that name so existing installations keep their local data.

## Current status

Early development, version 0.1.0. Linux Stable is in active use. macOS and Windows
portability code and CI checks are prepared, but native runtime behavior and
installers have not yet been validated on those platforms. Signed installers and
automatic updates are not available yet.

Kiro CLI V3 and Codex through `codex-acp` have been tried by the user. Other ACP
providers may work, depending on the protocol features they advertise. Provider
CLIs, accounts, authentication, and any provider charges are separate from this
application. Kiro-specific persistent-consent scope/pattern editing is not
implemented.

## Features

- Streamed chat with independent sessions, drafts, and composers.
- Recovery of open tabs, pane layouts and text drafts after restart; restored
  conversations stay disconnected until explicitly continued. Attachment contents
  are not restored; recovered drafts list files that need reattaching.
- Up to four tabbed panes: single, side-by-side, stacked, three panes, or a
  four-pane grid. Multi-pane grids reflow on smaller screens; Focus pane gives
  one conversation full space. Two-pane layouts have a resizable divider.
- Light and dark palettes, following the OS by default, with manual overrides.
- Fresh independent provider comparisons using a shared initial prompt.
- Project selection for new sessions and one shared project for Compare, with
  a native folder picker, recent-folder suggestions and unchanged saved provider
  defaults. Invalid folders keep the dialog and its prompt/attachments open.
- Conversation scroll positions survive tab/pane switches during the app run;
  first opens start at the latest response and readers at the bottom follow updates.
- SQLite conversation history, rename/delete, and continuation when supported by
  the provider's saved-session capabilities.
- Activity inspection with reported tool input/output, elapsed time, readable
  permission cards, and an expanded reading preset.
- Active approvals directly above the composer; historical requests cannot be approved.
- Per-conversation image/file attachments with a removable thumbnail strip; image
  and binary input depend on advertised provider capabilities.
- Agent and model selection from provider-advertised choices.
- Copy question, answer, or Q&A; collapsible sidebar; integrated Help.
- Separate Stable and Development identities, history, and provider settings.

Ollama HTTP, a project file browser, a read-only code viewer, and a diff viewer
are planned. See [milestones](docs/MILESTONES.md) for implementation details and
known limitations.

## Build and run Development

Install Git, Node.js/npm (CI selects Node 24), Rust stable, and the native
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating
system. Python 3 is needed for the backend subprocess tests, not for normal app
operation. Install and authenticate your chosen ACP provider separately.

From a clone of this repository:

```sh
npm ci
npm run tauri dev
```

This starts **Agentrance — Development**, with a DEV badge and its own app-data
directory. Keep Stable running for normal conversations; rebuilding Development
may interrupt sessions in Development.

### Configure a provider

On first launch, open or complete **Menu → Settings**:

1. Review automatically detected Kiro CLI / Codex ACP launchers, or add a provider.
2. Enter its display name, executable, and project folder in the form. Arguments
   have separate fields; environment overrides are optional. **Use for all** can
   apply one project folder to all providers.
3. Save settings, select the provider in the sidebar, choose **New session**,
   and confirm the project folder. Use **Browse…**, choose a recent folder or
   enter its full path.
   **Compare…** uses one explicitly selected project for every provider.
   Providers share that working tree, so changes by one can affect the others.

**Settings → Appearance** contains System, Light, and Dark. Appearance changes
apply immediately; provider edits are saved with **Save settings**.

Detection checks PATH and common install locations without running programs,
installing adapters or signing in. Fresh setups are prefilled with detected
launchers; existing saved providers are retained, with discoveries offered as
additions. A plain `codex` installation is not enough: Codex uses `codex-acp`.
Detection does not establish version compatibility or authentication; those are
checked when a session starts.

The initial Kiro configuration uses `kiro-cli` with arguments
`["acp", "--agent-engine=v3"]`. To use another adapter, configure its installed
executable and ACP arguments. Use an absolute executable path when a desktop
launch has a different PATH from your terminal. Do not put account credentials
in provider settings; log in using the provider's CLI.

On Windows, use native `.exe` providers directly. For an npm-installed adapter,
use the absolute path to `node.exe` as the executable and the adapter's JavaScript
entry file as the first argument. `.cmd`/`.bat` wrappers are not launched through
a shell. See [platform setup](scripts/README.md#platform-readiness-and-provider-setup)
for details.

## Checks

```sh
npm test
npm run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

The Rust tests use fake providers in isolated processes. They detect `python3` or
`python`; set `AGENTRANCE_TEST_PYTHON` to an absolute Python 3 executable path to
choose explicitly. Linux desktop-installation helpers have additional checks:

```sh
python3 tests/desktop_test.py
python3 tests/install_local_test.py
```

[Platform checks](.github/workflows/check.yml) runs frontend and Rust checks on
Linux, macOS, and Windows. It does not publish or install releases. Native UI,
clipboard transfer, real-provider behavior, and installer upgrades also need
hands-on verification.

## Release builds

Build native bundles on the target operating system:

```sh
npm run tauri build
```

Outputs are placed under `src-tauri/target/release/bundle`. macOS/Windows signing,
packaging, and installation remain work in progress; a successful build alone
is not native validation. See [release and rollback instructions](scripts/README.md)
for the optional Linux immutable-snapshot installer.

## Data and permissions

Conversation history and provider configuration are stored locally under the
channel-specific app-data directory. Stable uses `local.agentdesk.app` and
Development uses `local.agentdesk.app.dev`. Open tabs, pane layouts, recent
project choices and text drafts are saved locally in `workspace.json` for
recovery. Restored conversations stay disconnected until explicitly continued.
Attachment contents and the Compare dialog's unsent prompt are not restored.
Closing a conversation tab discards its draft.
Normal close/quit waits for the latest recovery save. A save failure keeps the
window open so you can retry or explicitly quit without saving. Forced termination
or a crash can still lose writes that have not reached disk.

Agentrance adds no application telemetry and does not manage provider account
credentials. Provider CLIs handle their own authentication, network access,
telemetry, and independently saved sessions. Local history does not imply that
a provider runs offline. Permission choices are explicit user actions; choosing
a persistent option leaves its scope and persistence behavior with the provider.

## Development notes

Read the [handoff](docs/HANDOFF.md) and [milestones](docs/MILESTONES.md) before
changing session, persistence, or permission behavior. Keep Stable independent
from Development. Report reproducible issues without including credentials,
private transcripts, or project contents you do not intend to share.

## License

A project license has not yet been selected. Third-party dependencies have their
own licenses.
