use std::io::{self, Read, Write};

#[no_mangle]
pub extern "C" fn run() {
    let mut input_str = String::new();
    io::stdin().read_to_string(&mut input_str).unwrap_or_default();

    let output = process(&input_str);
    io::stdout().write_all(output.as_bytes()).unwrap_or_default();
}

fn process(input_str: &str) -> String {
    let input: serde_json::Value = match serde_json::from_str(input_str) {
        Ok(v) => v,
        Err(_) => return r#"{"operations":[]}"#.to_string(),
    };

    let b2b_level = input["cart"]["attribute"]["value"].as_str().unwrap_or("");
    if b2b_level.is_empty() {
        return r#"{"operations":[]}"#.to_string();
    }

    let mut ops: Vec<serde_json::Value> = Vec::new();

    if let Some(groups) = input["cart"]["deliveryGroups"].as_array() {
        for group in groups {
            if let Some(options) = group["deliveryOptions"].as_array() {
                for opt in options {
                    let cost = &opt["cost"];
                    let amount: f64 = if cost.is_null() {
                        0.0
                    } else {
                        cost["amount"]
                            .as_str()
                            .and_then(|s| s.parse().ok())
                            .or_else(|| cost["amount"].as_f64())
                            .unwrap_or(1.0)
                    };
                    if amount == 0.0 {
                        let handle = opt["handle"].as_str().unwrap_or("");
                        ops.push(serde_json::json!({
                            "deliveryOptionHide": { "deliveryOptionHandle": handle }
                        }));
                    }
                }
            }
        }
    }

    serde_json::json!({ "operations": ops }).to_string()
}
