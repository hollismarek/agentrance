use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use serde_json::{json, Value};
#[derive(Deserialize)]
pub struct Attachment {
    pub name: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    pub data: String,
}
pub fn prompt(text: &str, files: &[Attachment], caps: &Value) -> Result<Vec<Value>, String> {
    if files.len() > 8 {
        return Err("At most 8 attachments are supported".into());
    }
    let mut total = 0;
    let mut blocks = vec![json!({"type":"text","text":text})];
    for (i, file) in files.iter().enumerate() {
        if file.data.len() > 7 * 1024 * 1024 {
            return Err("Attachment exceeds 5 MB".into());
        }
        let bytes = STANDARD
            .decode(&file.data)
            .map_err(|_| "Invalid attachment encoding")?;
        total += bytes.len();
        if bytes.len() > 5 * 1024 * 1024 || total > 15 * 1024 * 1024 {
            return Err("Attachment size limit exceeded".into());
        }
        if file.name.len() > 1024 || file.mime_type.len() > 200 {
            return Err("Invalid attachment metadata".into());
        }
        if matches!(
            file.mime_type.as_str(),
            "image/png" | "image/jpeg" | "image/webp" | "image/gif"
        ) {
            if caps["image"] != true {
                return Err("This provider does not advertise image input. Remove the image or use a provider with image support.".into());
            }
            blocks.push(json!({"type":"text","text":format!("Attached image: {}",file.name)}));
            blocks.push(json!({"type":"image","mimeType":file.mime_type,"data":file.data}));
        } else if let Some(contents) = std::str::from_utf8(&bytes)
            .ok()
            .filter(|_| file.mime_type != "application/pdf")
        {
            if !contents.contains('\0') {
                blocks.push(json!({"type":"text","text":format!("Attached file: {}\n{}",file.name,contents)}));
                continue;
            }
            if caps["embeddedContext"] != true {
                return Err("This provider does not support binary file attachments".into());
            }
            blocks.push(json!({"type":"text","text":format!("Attached file: {}",file.name)}));
            blocks.push(json!({"type":"resource","resource":{"uri":format!("attachment:///file-{i}"),"mimeType":file.mime_type,"blob":file.data}}));
        } else {
            if caps["embeddedContext"] != true {
                return Err("This provider does not support binary file attachments".into());
            }
            blocks.push(json!({"type":"text","text":format!("Attached file: {}",file.name)}));
            blocks.push(json!({"type":"resource","resource":{"uri":format!("attachment:///file-{i}"),"mimeType":file.mime_type,"blob":file.data}}));
        }
    }
    Ok(blocks)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn advertised_images_and_binary_are_encoded_and_size_limits_enforced() {
        let image = Attachment {
            name: "image.png".into(),
            mime_type: "image/png".into(),
            data: STANDARD.encode([1, 2, 3]),
        };
        let blocks = prompt("look", &[image], &json!({"image":true})).unwrap();
        assert_eq!(blocks[2]["type"], "image");
        let pdf = Attachment {
            name: "doc.pdf".into(),
            mime_type: "application/pdf".into(),
            data: STANDARD.encode("%PDF-test"),
        };
        assert!(prompt("", &[pdf], &json!({})).is_err());
        let pdf = Attachment {
            name: "doc.pdf".into(),
            mime_type: "application/pdf".into(),
            data: STANDARD.encode("%PDF-test"),
        };
        let blocks = prompt("", &[pdf], &json!({"embeddedContext":true})).unwrap();
        assert_eq!(blocks[2]["type"], "resource");
        let large = Attachment {
            name: "large".into(),
            mime_type: "text/plain".into(),
            data: STANDARD.encode(vec![b'x'; 5 * 1024 * 1024 + 1]),
        };
        assert!(prompt("", &[large], &json!({})).is_err());
    }
    #[test]
    fn capabilities_limits_and_text() {
        let file = Attachment {
            name: "notes.txt".into(),
            mime_type: "text/plain".into(),
            data: STANDARD.encode("hello"),
        };
        assert!(prompt("", &[file], &json!({})).unwrap()[1]["text"]
            .as_str()
            .unwrap()
            .contains("hello"));
        let image = Attachment {
            name: "image.png".into(),
            mime_type: "image/png".into(),
            data: STANDARD.encode([1, 2, 3]),
        };
        assert!(prompt("", &[image], &json!({})).is_err());
        let bad = Attachment {
            name: "bad".into(),
            mime_type: "application/pdf".into(),
            data: "not base64!".into(),
        };
        assert!(prompt("", &[bad], &json!({"embeddedContext":true})).is_err());
    }
}
