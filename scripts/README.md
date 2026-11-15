# Stable and development builds

The application remains cross-platform. Debug builds automatically use the
`local.agentdesk.app.dev` identity, **Agent Desk — Development** window title and
DEV icon. Release builds retain `local.agentdesk.app`. Both may run at once.
Tauri derives each app's data directory from its identity. SQLite history and
provider settings (`providers.json`) live there, so channel separation works
independently of platform webview behavior. Existing history under the
original identity belongs to Stable. Provider CLI authentication remains with
the provider and can be shared; do not copy credentials into Agent Desk.

## Develop on any supported desktop platform

```sh
npm install
npm run tauri dev
```

Run Stable for development conversations, pointed at the source repository in
Provider settings. Run Development alongside it for testing. Editing Rust may
restart Development and interrupt its sessions, but it does not restart Stable.
Unsent drafts are in-memory; finish responses and save needed text before closing
or upgrading either app. No data is migrated between channels. Stable can import its own legacy
webview provider settings once; Development starts with separate defaults.

## Native distributions: Windows, macOS and Linux

```sh
npm run tauri build
```

Use Tauri's native bundles under `src-tauri/target/release/bundle` on the target
OS. Standard ICO/ICNS/PNG assets remain configured. Native installation, platform
signing and runtime prerequisites still apply. Windows/macOS packaging has not
been validated on this Linux machine; no Linux desktop integration is used by
application code on those platforms. Preserve the previous installer/package
when testing an upgrade. Debug builds are not distributed as Stable installers.

## Local release snapshots on this Linux workstation

This optional helper avoids packaging downloads and root access. Build a release
with the embedded frontend (not a debug binary that depends on Vite):

```sh
npm run build
cargo build --release --features custom-protocol --manifest-path src-tauri/Cargo.toml
python3 scripts/install-local.py
python3 scripts/install-local.py --install
```

Preview is read-only. Installation copies the executable and its icons into an
immutable, content-addressed folder under
`~/.local/share/agent-desk/releases` (or `$XDG_DATA_HOME/agent-desk/releases`).
The **Agent Desk** application-menu launcher points at that copy, not at the
checkout. It remains usable if the checkout is rebuilt or moved. The helper
records the current and previous snapshot in `agent-desk/install.json`; installing
the same build again preserves the rollback target. No snapshots are deleted.
A hidden Development desktop entry registers the DEV taskbar icon when a debug
binary exists; start Development with `npm run tauri dev`, not that hidden entry.

```sh
python3 scripts/install-local.py --rollback
```

Rollback switches the launcher to the previous snapshot and keeps the current
one available for switching back. Existing processes are never stopped or
replaced. Finish a response and close Stable before relaunching an upgrade or
rollback. Conversation databases and provider settings are never copied or
changed by the installer. Binary rollback does not roll back databases: future
incompatible schema changes will need an explicit migration/backup plan.

On first launch, review **Menu → Provider settings** and set the repository's
absolute path. Stable and Development may need separate provider configuration.
The installed launcher starts in its release folder, so it has no dependency on
the source checkout. Native CLI authentication stays external.

`install-desktop.py` supplies the tested Linux desktop-entry utilities. Its older
direct registration command points at a checkout binary; use `install-local.py`
for stable snapshots instead.
