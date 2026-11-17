// Write only; no clipboard-read command is exposed on any platform.
#[tauri::command]
pub async fn copy_text(app: tauri::AppHandle, text: String) -> Result<(), String> {
    if text.contains('\0') {
        return Err("Clipboard text cannot contain null characters".into());
    }
    #[cfg(target_os = "linux")]
    {
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let clipboard = gtk::Clipboard::get(&gtk::gdk::SELECTION_CLIPBOARD);
            clipboard.set_text(&text);
            clipboard.store();
            let _ = tx.send(());
        })
        .map_err(|e| format!("Could not access the clipboard: {e}"))?;
        rx.await
            .map_err(|_| "Clipboard write did not complete".to_string())
    }
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        // Serialize writes on the UI thread (also required by native UI toolkits).
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let result = arboard::Clipboard::new()
                .and_then(|mut clipboard| clipboard.set_text(text))
                .map_err(|e| format!("Could not write to the clipboard: {e}"));
            let _ = tx.send(result);
        }).map_err(|e| format!("Could not access the clipboard: {e}"))?;
        rx.await.map_err(|_| "Clipboard write did not complete".to_string())?
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    { let _ = (app, text); Err("Clipboard copying is not supported on this platform".into()) }
}
