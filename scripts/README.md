# Stable and development builds

The application remains cross-platform. Debug builds automatically use the
`local.agentdesk.app.dev` identity, **Agentrance — Development** window title and
DEV icon. Release builds retain `local.agentdesk.app`. Both may run at once.
Tauri derives each app's data directory from its identity. SQLite history and
provider settings (`providers.json`) live there, so channel separation works
independently of platform webview behavior. Existing history under the
original identity belongs to Stable. Provider CLI authentication remains with
the provider and can be shared; do not copy credentials into Agentrance.

## Develop on any supported desktop platform

```sh
npm install
npm run tauri dev
```

Run Stable for development conversations, pointed at the source repository in
Settings. Run Development alongside it for testing. Editing Rust may
restart Development and interrupt its sessions, but it does not restart Stable.
New builds recover open tabs/layout and text drafts within each channel; older
installed builds may still keep drafts only in memory. Attachment contents and
unsent Compare prompts are not recovered. Finish responses and save needed text
before upgrading either app. No data is migrated between channels. Stable can import its own legacy
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
The **Agentrance** application-menu launcher points at that copy, not at the
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

On first launch, review **Menu → Settings** and set the repository's
absolute path. Stable and Development may need separate provider configuration.
The installed launcher starts in its release folder, so it has no dependency on
the source checkout. Native CLI authentication stays external.

`install-desktop.py` supplies the tested Linux desktop-entry utilities. Its older
direct registration command points at a checkout binary; use `install-local.py`
for stable snapshots instead.


The public product name is **Agentrance** (formerly Agent Desk). Internal package
names, executable filenames, application IDs and storage paths retain `agent-desk`
and `local.agentdesk.app` for compatibility with existing installations. New
builds and generated desktop entries use the new display name; an already
installed Stable snapshot keeps its original UI until explicitly upgraded.

## Platform readiness and provider setup

Fresh installed builds open Settings with an empty project directory.
Choose an existing absolute project folder and save before starting a session.
Development can still suggest the repository root; existing saved configurations
are retained. Settings uses provider forms for names, executables, project folders,
argument lists and environment overrides; no JSON editing is required. Appearance
settings are on the same screen. Known Kiro CLI / Codex ACP launchers are detected
from PATH and common install locations without executing them. New setups are
prefilled; existing configurations are retained with discoveries available to add.

Use an absolute provider executable path when desktop PATH differs from your
terminal. Bare executable names search absolute PATH entries, including a configured
PATH override. Relative executable paths are rejected with setup guidance.
Windows .cmd/.bat wrappers are deliberately not passed through a shell. For an
npm-installed ACP adapter, configure the absolute `node.exe` path as `executable`
and the adapter's JavaScript entry file as the first item in `args`, followed by
its normal arguments. Install and authenticate each provider separately.

Windows release builds hide the application's console, and provider processes
retain piped stdio without creating a console window. Linux copying continues to
use GTK; macOS and Windows use native text clipboard writes through arboard.
Only the existing write command is exposed to the frontend.

ACP tests require Python 3. They detect `python3` or `python`; set
`AGENTRANCE_TEST_PYTHON` to an absolute interpreter path to choose explicitly.
The Platform checks workflow runs frontend/Rust checks on Linux, macOS and Windows
when pushed to GitHub. Linux desktop-installer tests only run on Linux. The
workflow checks code; it does not publish releases or install applications.
Native UI, CLI authentication/continuation, clipboard paste, process shutdown,
installer upgrades and signing still require platform validation.

## Back up and restore Agentrance data

The backup helper uses Python 3 and runs from this checkout on Linux, macOS and
Windows. Use `python` instead of `python3` if that is your Python command.

```sh
python3 scripts/backup.py backup agentrance-backup.zip
python3 scripts/backup.py restore agentrance-backup.zip --data-dir ./restore-check
```

The ZIP contains SQLite conversation history, saved provider settings, and the
last saved workspace recovery file, including text drafts. The SQLite online
backup includes committed WAL changes. For the most recent drafts, quit
Agentrance normally before backing up. Keep the ZIP private because conversations,
drafts, and provider environment overrides may contain sensitive data.

The default profile is Stable. Use `--channel development` for Development or
`--data-dir` for a custom location. Restore requires a destination that does not
exist. To restore into the actual app profile, quit Agentrance and move the
existing profile folder aside before restoring without `--data-dir`. Keep the
moved folder until you've verified the restored copy. The default locations are:

- Linux: `${XDG_DATA_HOME:-~/.local/share}/local.agentdesk.app`
- macOS: `~/Library/Application Support/local.agentdesk.app`
- Windows: `%APPDATA%\local.agentdesk.app`

Development appends `.dev` to the folder name. Restore only backups you trust.
Project files, attached image bytes, provider authentication stores, and the
provider's own conversation state are managed separately. Restored conversations
can be read locally. Continuing them depends on access to the original provider
session and project directory. Review provider executable and project paths
when moving a backup to another computer.

In the desktop app, open **Menu → Backup & Restore** to create the same ZIP
without Python. To restore, choose a backup you trust, confirm **Restore on next
launch**, and quit and reopen Agentrance. The restore is prepared in a separate
folder under the channel's `profiles` directory. The existing profile stays
available on disk. The terminal backup helper follows the `active-profile`
marker when a channel uses a restored profile.
