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

fn is_rechnung(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("rechnung") || lower.contains("invoice") || lower.contains("kauf auf rechnung")
}

fn process(input_str: &str) -> String {
    let input: serde_json::Value = match serde_json::from_str(input_str) {
        Ok(v) => v,
        Err(_) => return r#"{"operations":[]}"#.to_string(),
    };

    let is_b2b = check_b2b(&input);
    let mut ops: Vec<serde_json::Value> = Vec::new();

    if let Some(methods) = input["paymentMethods"].as_array() {
        for method in methods {
            let name = method["name"].as_str().unwrap_or("");
            let id = method["id"].as_str().unwrap_or("");
            if is_rechnung(name) {
                if is_b2b {
                    ops.push(serde_json::json!({
                        "move": { "paymentMethodId": id, "index": 0 }
                    }));
                } else {
                    ops.push(serde_json::json!({
                        "hide": { "paymentMethodId": id }
                    }));
                }
            }
        }
    }

    serde_json::json!({ "operations": ops }).to_string()
}
