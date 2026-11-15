use tauri::utils::config::Config;

pub fn configure(config: &mut Config, development: bool) {
    if development {
        config.identifier.push_str(".dev");
        config.product_name = Some("Agent Desk Development".into());
        for window in &mut config.app.windows {
            window.title = "Agent Desk — Development".into();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn development_identity_is_separate_and_release_is_unchanged() {
        let stable: Config = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let mut release = stable.clone();
        configure(&mut release, false);
        assert_eq!(release.identifier, stable.identifier);
        assert_eq!(release.product_name, stable.product_name);
        assert_eq!(release.app.windows[0].title, stable.app.windows[0].title);
        let mut dev = stable.clone();
        configure(&mut dev, true);
        assert_eq!(dev.identifier, format!("{}.dev", stable.identifier));
        assert_ne!(dev.product_name, stable.product_name);
        assert!(dev.app.windows[0].title.contains("Development"));
    }
}
