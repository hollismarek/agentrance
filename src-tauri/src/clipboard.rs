// Agent Desk's Linux webview already uses GTK. Write only; no clipboard-read API.
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
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, text);
        Err("Clipboard copying is available on Linux in this build".into())
    }
}
