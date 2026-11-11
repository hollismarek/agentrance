use serde::Serialize;
use serde_json::{json, Value};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub rate_multiplier: Option<f64>,
    pub rate_unit: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub current: Option<String>,
    pub choices: Vec<Choice>,
    pub method: String,
    pub config_id: Option<String>,
}
#[derive(Default)]
pub struct State {
    modes: Value,
    configs: Value,
    config_mode_seen: bool,
    pub revision: u64,
    pub mode_revision: u64,
}
fn mode_option(v: &Value) -> bool {
    v["type"] == "select" && (v["category"] == "mode" || v["id"] == "mode")
}
fn config_choices(options: &Value) -> Vec<Choice> {
    let mut choices = Vec::new();
    if let Some(entries) = options.as_array() {
        for entry in entries {
            if entry["options"].is_array() {
                choices.extend(config_choices(&entry["options"]));
            } else if let (Some(id), Some(name)) = (entry["value"].as_str(), entry["name"].as_str())
            {
                if !choices.iter().any(|c| c.id == id) {
                    choices.push(Choice {
                        id: id.into(),
                        name: name.into(),
                        description: entry["description"].as_str().map(String::from),
                        rate_multiplier: entry["_meta"]["kiro"]["rateMultiplier"]
                            .as_f64()
                            .filter(|v| v.is_finite() && *v >= 0.0),
                        rate_unit: entry["_meta"]["kiro"]["rateUnit"]
                            .as_str()
                            .map(String::from),
                    });
                }
            }
        }
    }
    choices
}
impl State {
    pub fn setup(&mut self, v: &Value) {
        if v["modes"].is_object() {
            self.modes = v["modes"].clone();
            self.mode_revision += 1;
            self.revision += 1;
        }
        if let Some(options) = v["configOptions"].as_array() {
            if self.config_mode_seen || options.iter().any(mode_option) {
                self.mode_revision += 1;
            }
            self.config_mode_seen |= options.iter().any(mode_option);
            self.configs = v["configOptions"].clone();
            self.revision += 1;
        }
    }
    pub fn update(&mut self, v: &Value) -> bool {
        match v["sessionUpdate"].as_str() {
            Some("config_option_update") => {
                self.setup(v);
                true
            }
            Some("current_mode_update") => {
                if let Some(id) = v["currentModeId"].as_str() {
                    self.confirm(id);
                    true
                } else {
                    false
                }
            }
            _ => false,
        }
    }
    pub fn selection(&self) -> Option<Selection> {
        if let Some(option) = self
            .configs
            .as_array()
            .and_then(|options| options.iter().find(|o| mode_option(o)))
        {
            let id = option["id"].as_str()?;
            return Some(Selection {
                current: option["currentValue"].as_str().map(String::from),
                choices: config_choices(&option["options"])
                    .into_iter()
                    .map(|mut choice| {
                        if choice.description.is_none() {
                            choice.description = self.modes["availableModes"]
                                .as_array()
                                .and_then(|modes| {
                                    modes
                                        .iter()
                                        .find(|m| m["id"].as_str() == Some(choice.id.as_str()))
                                })
                                .and_then(|mode| mode["description"].as_str())
                                .map(String::from);
                        }
                        choice
                    })
                    .collect(),
                method: "session/set_config_option".into(),
                config_id: Some(id.into()),
            });
        }
        // A complete configuration update can remove this control. Do not
        // revive an old modes list after the provider has withdrawn it.
        if self.config_mode_seen {
            return None;
        }
        let modes = self.modes["availableModes"].as_array()?;
        let mut choices = Vec::new();
        for mode in modes {
            if let (Some(id), Some(name)) = (mode["id"].as_str(), mode["name"].as_str()) {
                if !choices.iter().any(|c: &Choice| c.id == id) {
                    choices.push(Choice {
                        id: id.into(),
                        name: name.into(),
                        description: mode["description"].as_str().map(String::from),
                        rate_multiplier: None,
                        rate_unit: None,
                    });
                }
            }
        }
        Some(Selection {
            current: self.modes["currentModeId"].as_str().map(String::from),
            choices,
            method: "session/set_mode".into(),
            config_id: None,
        })
    }
    pub fn model(&self) -> Option<Selection> {
        let option =
            self.configs.as_array()?.iter().find(|o| {
                o["type"] == "select" && (o["category"] == "model" || o["id"] == "model")
            })?;
        Some(Selection {
            current: option["currentValue"].as_str().map(String::from),
            choices: config_choices(&option["options"]),
            method: "session/set_config_option".into(),
            config_id: Some(option["id"].as_str()?.into()),
        })
    }
    pub fn request_model(&self, remote: &str, id: &str) -> Result<(String, Value), String> {
        let selection = self
            .model()
            .ok_or("This provider has not exposed model selection for this session")?;
        if !selection.choices.iter().any(|c| c.id == id) {
            return Err("Choose a model advertised by this session".into());
        }
        Ok((
            selection.method,
            json!({"sessionId":remote,"configId":selection.config_id,"value":id}),
        ))
    }
    pub fn snapshot(&self) -> Value {
        json!({"selection":self.selection(),"model":self.model(),"revision":self.revision})
    }
    pub fn request(&self, remote: &str, id: &str) -> Result<(String, Value), String> {
        let selection = self
            .selection()
            .ok_or("This provider has not exposed agent selection for this session")?;
        if !selection.choices.iter().any(|c| c.id == id) {
            return Err("Choose an agent advertised by this session".into());
        }
        let params = match selection.config_id {
            Some(config) => json!({"sessionId":remote,"configId":config,"value":id}),
            None => json!({"sessionId":remote,"modeId":id}),
        };
        Ok((selection.method, params))
    }
    pub fn confirm(&mut self, id: &str) {
        self.mode_revision += 1;
        self.modes["currentModeId"] = json!(id);
        if let Some(options) = self.configs.as_array_mut() {
            for option in options.iter_mut().filter(|o| mode_option(o)) {
                option["currentValue"] = json!(id);
            }
        }
        self.revision += 1;
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn modes_use_opaque_advertised_ids_and_reject_unknown_agents() {
        let mut s = State::default();
        s.setup(&json!({"modes":{"currentModeId":"custom/reviewer","availableModes":[{"id":"custom/reviewer","name":"Reviewer"},{"id":"vibe","name":"Vibe"}]}}));
        assert_eq!(
            s.selection().unwrap().current.as_deref(),
            Some("custom/reviewer")
        );
        assert_eq!(
            s.request("remote", "vibe").unwrap(),
            (
                "session/set_mode".into(),
                json!({"sessionId":"remote","modeId":"vibe"})
            )
        );
        assert!(s.request("remote", "invented").is_err());
        assert!(s.update(&json!({"sessionUpdate":"current_mode_update","currentModeId":"vibe"})));
        assert_eq!(s.selection().unwrap().current.as_deref(), Some("vibe"));
    }
    #[test]
    fn configuration_is_preferred_and_grouped_choices_are_supported() {
        let mut s = State::default();
        s.setup(&json!({"modes":{"currentModeId":"stale","availableModes":[]},"configOptions":[
            {"id":"mode","category":"mode","type":"select","currentValue":"review","options":[{"group":"custom","name":"Custom","options":[{"value":"review","name":"Review"},{"value":"code","name":"Code"}]}]},
            {"id":"model","type":"select","currentValue":"m","options":[]}]}));
        assert_eq!(s.selection().unwrap().choices.len(), 2);
        assert_eq!(
            s.request("r", "code").unwrap(),
            (
                "session/set_config_option".into(),
                json!({"sessionId":"r","configId":"mode","value":"code"})
            )
        );
        s.update(&json!({"sessionUpdate":"current_mode_update","currentModeId":"code"}));
        assert_eq!(s.selection().unwrap().current.as_deref(), Some("code"));
        s.update(&json!({"sessionUpdate":"config_option_update","configOptions":[]}));
        assert!(s.selection().is_none());
        assert!(s.request("r", "review").is_err());
    }
    #[test]
    fn malformed_and_missing_controls_do_not_invent_choices() {
        let mut s = State::default();
        s.setup(&json!({"configOptions":null,"modes":false}));
        assert!(s.selection().is_none());
        s.setup(&json!({"modes":{"availableModes":[null,{"id":2,"name":{}},{"id":"a","name":"A"},{"id":"a","name":"Duplicate"}],"currentModeId":"unknown"}}));
        assert_eq!(s.selection().unwrap().choices.len(), 1);
        assert_eq!(s.selection().unwrap().current.as_deref(), Some("unknown"));
    }
    #[test]
    fn models_are_separate_from_modes_and_preserve_reported_descriptions_and_rates() {
        let mut s = State::default();
        s.setup(&json!({"modes":{"currentModeId":"plan","availableModes":[{"id":"plan","name":"Plan","description":"Plans before implementation"}]},"configOptions":[
            {"id":"mode","type":"select","category":"mode","currentValue":"plan","options":[{"value":"plan","name":"Plan"}]},
            {"id":"model","type":"select","category":"model","currentValue":"auto","options":[{"value":"auto","name":"Auto","description":"Models chosen by task","_meta":{"kiro":{"rateMultiplier":1.0,"rateUnit":"credits"}}},{"value":"sonnet","name":"Claude Sonnet","description":"Sonnet model","_meta":{"kiro":{"rateMultiplier":1.3}}}]}]}));
        assert_eq!(s.model().unwrap().current.as_deref(), Some("auto"));
        assert_eq!(
            s.selection().unwrap().choices[0].description.as_deref(),
            Some("Plans before implementation")
        );
        assert_eq!(s.model().unwrap().choices[1].rate_multiplier, Some(1.3));
        assert_eq!(
            s.request_model("r", "sonnet").unwrap(),
            (
                "session/set_config_option".into(),
                json!({"sessionId":"r","configId":"model","value":"sonnet"})
            )
        );
        assert!(s.request_model("r", "plan").is_err());
        assert!(s.request("r", "sonnet").is_err());
        s.confirm("plan");
        assert_eq!(s.model().unwrap().current.as_deref(), Some("auto"));
        s.setup(&json!({"configOptions":[]}));
        assert!(s.model().is_none());
        assert!(s.request_model("r", "sonnet").is_err());
    }
}
