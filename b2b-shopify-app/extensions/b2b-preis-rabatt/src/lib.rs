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
        Err(_) => {
            return r#"{"discounts":[],"discountApplicationStrategy":"FIRST"}"#.to_string()
        }
    };

    let b2b_level = input["cart"]["attribute"]["value"].as_str().unwrap_or("");

    let price_key = match b2b_level {
        "B2B1" => "p1",
        "B2B2" => "p2",
        "B2B3" => "p3",
        _ => return r#"{"discounts":[],"discountApplicationStrategy":"FIRST"}"#.to_string(),
    };

    let mut discounts: Vec<serde_json::Value> = Vec::new();

    if let Some(lines) = input["cart"]["lines"].as_array() {
        for line in lines {
            let retail: f64 = line["cost"]["amountPerQuantity"]["amount"]
                .as_str()
                .unwrap_or("0")
                .parse()
                .unwrap_or(0.0);

            let merchandise = &line["merchandise"];
            if merchandise["__typename"].as_str() != Some("ProductVariant") {
                continue;
            }
            let variant_id = merchandise["id"].as_str().unwrap_or("");
            let b2b_net_str = merchandise["product"][price_key]["value"]
                .as_str()
                .unwrap_or("");

            if b2b_net_str.is_empty() {
                continue;
            }
            let b2b_net: f64 = match b2b_net_str.parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            if b2b_net <= 0.0 {
                continue;
            }

            // Net to gross (19% MwSt)
            let b2b_gross = (b2b_net * 1.19 * 100.0).round() / 100.0;
            let discount = retail - b2b_gross;
            if discount <= 0.0 {
                continue;
            }

            discounts.push(serde_json::json!({
                "targets": [{ "productVariant": { "id": variant_id } }],
                "value": {
                    "fixedAmount": {
                        "amount": format!("{:.2}", discount),
                        "appliesToEachItem": true
                    }
                }
            }));
        }
    }

    serde_json::json!({
        "discounts": discounts,
        "discountApplicationStrategy": "FIRST"
    })
    .to_string()
}
