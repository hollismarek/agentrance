# Linux desktop integration

On KDE/Wayland the window's application ID must match an installed desktop entry. Merely replacing the bundled PNG does not install a menu entry or icon theme resource. Agent Desk enables Tauri's GTK application ID using `local.agentdesk.app`.

Build a standalone binary that embeds the frontend (it does not need a Vite server):

```sh
npm run build
cargo build --release --features custom-protocol --manifest-path src-tauri/Cargo.toml
```

Preview registration, then install for the current user:

```sh
python3 scripts/install-desktop.py
python3 scripts/install-desktop.py --install
```

This installs `local.agentdesk.app.desktop` under the user's applications directory and 32/128/256-pixel icons under their hicolor icon theme. The installer refreshes available desktop caches without launching or stopping the app. No system-wide files or administrative privileges are needed. The launcher points at this checkout's release binary and uses the repository as its initial working directory. Rerun registration if the checkout moves.

Close existing Agent Desk windows before starting the updated application. Launch **Agent Desk** from the KDE application menu; development windows use the same application identity and icon. GTK's registered application ID allows one running process for this app identity; conversations still run independently within its single window.
