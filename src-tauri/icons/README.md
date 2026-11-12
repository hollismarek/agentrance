# Agent Desk icon

`icon-source.png` is the original Connected agent workspace image supplied by the user.
`icon.png` is the 256-pixel application icon; 128x128.png and 32x32.png are smaller variants.

Regenerate from the repository root with:

```sh
npm run tauri -- icon src-tauri/icons/icon-source.png --output src-tauri/icons --png 32 --png 128 --png 256
```

Replace icon.png with the generated 256x256.png afterwards. Keep the original artwork unchanged.
