use std::io::{self, Read, Write};

#[no_mangle]
pub extern "C" fn run() {
    let mut input_str = String::new();
    io::stdin().read_to_string(&mut input_str).unwrap_or_default();

    let output = process(&input_str);
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    handle.write_all(output.as_bytes()).unwrap_or_default();
    handle.flush().unwrap_or_default();
}

fn process(input_str: &str) -> String {
    let input: serde_json::Value = match serde_json::from_str(input_str) {
        Ok(v) => v,
        Err(_) => return r#"{"operations":[]}"#.to_string(),
    };

    let b2b_level = input["cart"]["attribute"]["value"].as_str().unwrap_or("");
    let is_b2b = matches!(b2b_level, "B2B1" | "B2B2" | "B2B3");

    let mut ops: Vec<serde_json::Value> = Vec::new();

    if let Some(groups) = input["cart"]["deliveryGroups"].as_array() {
        for group in groups {
            let options = match group["deliveryOptions"].as_array() {
                Some(o) => o,
                None => continue,
            };

            // Gibt es in dieser Gruppe eine Gratis-Option (0 €)?
            let has_free = options.iter().any(|opt| option_amount(opt) == 0.0);

            for opt in options {
                let amount = option_amount(opt);
                let handle = opt["handle"].as_str().unwrap_or("");
                if handle.is_empty() {
                    continue;
                }

                // B2B: kein Gratisversand -> Gratis-Optionen verstecken.
                // Regulär: wenn Gratis verfügbar, die bezahlten Optionen verstecken,
                //          damit der Gratisversand greift (ab 69 €).
                let hide = if is_b2b {
                    amount == 0.0
                } else {
                    has_free && amount > 0.0
                };

                if hide {
                    ops.push(serde_json::json!({
                        "hide": { "deliveryOptionHandle": handle }
                    }));
                }
            }
        }
    }

    serde_json::json!({ "operations": ops }).to_string()
}

// Liest den Preis einer Versandoption robust aus (String, Zahl oder null).
fn option_amount(opt: &serde_json::Value) -> f64 {
    let cost = &opt["cost"];
    if cost.is_null() {
        return 0.0;
    }
    cost["amount"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .or_else(|| cost["amount"].as_f64())
        .unwrap_or(1.0)
}
