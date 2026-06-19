use std::io::{self, Read, Write};

#[no_mangle]
pub extern "C" fn run() {
    let mut input_str = String::new();
    io::stdin().read_to_string(&mut input_str).unwrap_or_default();

    let output = process(&input_str);
    io::stdout().write_all(output.as_bytes()).unwrap_or_default();
}

fn check_b2b(input: &serde_json::Value) -> bool {
    let c = &input["cart"]["buyerIdentity"]["customer"];
    c["b2b1"].as_bool().unwrap_or(false)
        || c["b2b2"].as_bool().unwrap_or(false)
        || c["b2b3"].as_bool().unwrap_or(false)
}

fn process(input_str: &str) -> String {
    let input: serde_json::Value = match serde_json::from_str(input_str) {
        Ok(v) => v,
        Err(_) => return r#"{"operations":[]}"#.to_string(),
    };

    if !check_b2b(&input) {
        return r#"{"operations":[]}"#.to_string();
    }

    let mut ops: Vec<serde_json::Value> = Vec::new();

    if let Some(groups) = input["cart"]["deliveryGroups"].as_array() {
        for group in groups {
            if let Some(options) = group["deliveryOptions"].as_array() {
                for opt in options {
                    let amount: f64 = opt["cost"]["amount"]
                        .as_str()
                        .unwrap_or("1")
                        .parse()
                        .unwrap_or(1.0);
                    if amount == 0.0 {
                        let handle = opt["handle"].as_str().unwrap_or("");
                        ops.push(serde_json::json!({
                            "hide": { "deliveryOptionHandle": handle }
                        }));
                    }
                }
            }
        }
    }

    serde_json::json!({ "operations": ops }).to_string()
}
