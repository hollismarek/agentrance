use serde_json::Value;

pub fn method(init: &Value) -> Result<&'static str, String> {
    if init["agentCapabilities"]["sessionCapabilities"]["resume"].is_object() {
        Ok("session/resume")
    } else if init["agentCapabilities"]["loadSession"] == true {
        Ok("session/load")
    } else {
        Err("This provider does not support continuing saved ACP conversations. Your saved history is still available.".into())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn respects_advertised_capabilities() {
        assert_eq!(method(&json!({"agentCapabilities":{"sessionCapabilities":{"resume":{}},"loadSession":true}})).unwrap(),"session/resume");
        assert_eq!(
            method(&json!({"agentCapabilities":{"loadSession":true}})).unwrap(),
            "session/load"
        );
        for init in [
            json!({}),
            json!({"agentCapabilities":{"loadSession":false}}),
        ] {
            assert!(method(&init).is_err());
        }
    }
}
