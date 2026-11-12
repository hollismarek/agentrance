# Agent Desk icon

`icon-source.png` is the original artwork supplied by the user. Tauri uses PNGs
for Linux, `icon.ico` for Windows, and `icon.icns` for macOS. `public/favicon.png`
is the web page icon; it does not control the native taskbar icon.

Regenerate with Tauri's standard icon generator into a temporary directory:

```sh
npm run tauri -- icon src-tauri/icons/icon-source.png --output /tmp/agent-desk-icons
```

Copy the desktop PNG, ICO and ICNS assets into this directory, and copy 32x32.png
to public/favicon.png. Mobile assets are not used by this desktop app.
