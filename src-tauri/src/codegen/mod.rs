use tenso_shared::models::*;

pub fn generate(method: &str, url: &str, headers: &[KeyValue], body: &RequestBody, language: &str) -> Result<String, String> {
    match language {
        "curl" => Ok(generate_curl(method, url, headers, body)),
        "python" => Ok(generate_python(method, url, headers, body)),
        "javascript" => Ok(generate_javascript(method, url, headers, body)),
        _ => Err(format!("Unsupported language: {}", language)),
    }
}

fn generate_curl(method: &str, url: &str, headers: &[KeyValue], body: &RequestBody) -> String {
    let mut parts = vec![format!("curl -X {} '{}'", method, url)];
    for h in headers.iter().filter(|h| h.enabled) {
        parts.push(format!("  -H '{}: {}'", h.key, h.value));
    }
    match body {
        RequestBody::Json { content } => {
            parts.push(format!("  -H 'Content-Type: application/json'"));
            parts.push(format!("  -d '{}'", content));
        }
        RequestBody::Raw { content, content_type } => {
            parts.push(format!("  -H 'Content-Type: {}'", content_type));
            parts.push(format!("  -d '{}'", content));
        }
        _ => {}
    }
    parts.join(" \\\n")
}

fn generate_python(method: &str, url: &str, headers: &[KeyValue], body: &RequestBody) -> String {
    let mut lines = vec!["import requests".to_string(), String::new()];
    let active_headers: Vec<_> = headers.iter().filter(|h| h.enabled).collect();
    if !active_headers.is_empty() {
        lines.push("headers = {".to_string());
        for h in &active_headers {
            lines.push(format!("    \"{}\": \"{}\",", h.key, h.value));
        }
        lines.push("}".to_string());
    }
    match body {
        RequestBody::Json { content } => {
            lines.push(format!("\ndata = {}", content));
            lines.push(format!("\nresponse = requests.{}(\"{}\", headers=headers, json=data)", method.to_lowercase(), url));
        }
        _ => {
            if active_headers.is_empty() {
                lines.push(format!("\nresponse = requests.{}(\"{}\")", method.to_lowercase(), url));
            } else {
                lines.push(format!("\nresponse = requests.{}(\"{}\", headers=headers)", method.to_lowercase(), url));
            }
        }
    }
    lines.push("\nprint(response.status_code)".to_string());
    lines.push("print(response.text)".to_string());
    lines.join("\n")
}

fn generate_javascript(method: &str, url: &str, headers: &[KeyValue], body: &RequestBody) -> String {
    let active_headers: Vec<_> = headers.iter().filter(|h| h.enabled).collect();
    let mut lines = vec![];
    let has_body = !matches!(body, RequestBody::None);

    lines.push(format!("const response = await fetch(\"{}\", {{", url));
    lines.push(format!("  method: \"{}\",", method));

    if !active_headers.is_empty() || has_body {
        lines.push("  headers: {".to_string());
        for h in &active_headers {
            lines.push(format!("    \"{}\": \"{}\",", h.key, h.value));
        }
        if let RequestBody::Json { .. } = body {
            lines.push("    \"Content-Type\": \"application/json\",".to_string());
        }
        lines.push("  },".to_string());
    }

    match body {
        RequestBody::Json { content } => {
            lines.push(format!("  body: JSON.stringify({}),", content));
        }
        RequestBody::Raw { content, .. } => {
            lines.push(format!("  body: \"{}\",", content.replace('"', "\\\"")));
        }
        _ => {}
    }

    lines.push("});".to_string());
    lines.push(String::new());
    lines.push("const data = await response.json();".to_string());
    lines.push("console.log(data);".to_string());
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kv(key: &str, value: &str, enabled: bool) -> KeyValue {
        KeyValue { key: key.into(), value: value.into(), enabled }
    }

    #[test]
    fn curl_get_no_body() {
        let out = generate("GET", "https://example.com", &[], &RequestBody::None, "curl").unwrap();
        assert!(out.contains("curl -X GET"));
        assert!(out.contains("https://example.com"));
        assert!(!out.contains("-d"));
    }

    #[test]
    fn curl_post_with_json() {
        let body = RequestBody::Json { content: r#"{"key":"val"}"#.into() };
        let out = generate("POST", "https://example.com", &[], &body, "curl").unwrap();
        assert!(out.contains("-d"));
        assert!(out.contains("Content-Type: application/json"));
        assert!(out.contains(r#"{"key":"val"}"#));
    }

    #[test]
    fn curl_with_raw_body() {
        let body = RequestBody::Raw { content: "xml data".into(), content_type: "text/xml".into() };
        let out = generate("POST", "https://example.com", &[], &body, "curl").unwrap();
        assert!(out.contains("Content-Type: text/xml"));
        assert!(out.contains("xml data"));
    }

    #[test]
    fn curl_filters_disabled_headers() {
        let headers = vec![kv("X-Enabled", "yes", true), kv("X-Disabled", "no", false)];
        let out = generate("GET", "https://example.com", &headers, &RequestBody::None, "curl").unwrap();
        assert!(out.contains("X-Enabled"));
        assert!(!out.contains("X-Disabled"));
    }

    #[test]
    fn python_with_json_body() {
        let body = RequestBody::Json { content: r#"{"k":"v"}"#.into() };
        let headers = vec![kv("Accept", "application/json", true)];
        let out = generate("POST", "https://example.com", &headers, &body, "python").unwrap();
        assert!(out.contains("import requests"));
        assert!(out.contains("json=data"));
        assert!(out.contains("requests.post"));
        assert!(out.contains("headers=headers"));
    }

    #[test]
    fn python_get_no_body_no_headers() {
        let out = generate("GET", "https://example.com", &[], &RequestBody::None, "python").unwrap();
        assert!(out.contains("requests.get(\"https://example.com\")"));
        assert!(!out.contains("headers="));
        assert!(!out.contains("json="));
    }

    #[test]
    fn javascript_fetch_with_json() {
        let body = RequestBody::Json { content: r#"{"k":"v"}"#.into() };
        let out = generate("POST", "https://example.com", &[], &body, "javascript").unwrap();
        assert!(out.contains("await fetch"));
        assert!(out.contains("method: \"POST\""));
        assert!(out.contains("JSON.stringify"));
        assert!(out.contains("Content-Type"));
    }

    #[test]
    fn javascript_fetch_with_raw_body() {
        let body = RequestBody::Raw { content: "hello".into(), content_type: "text/plain".into() };
        let out = generate("POST", "https://example.com", &[], &body, "javascript").unwrap();
        assert!(out.contains("body:"));
        assert!(!out.contains("JSON.stringify"));
    }

    #[test]
    fn unsupported_language_returns_error() {
        let r = generate("GET", "https://example.com", &[], &RequestBody::None, "ruby");
        assert!(r.is_err());
        assert!(r.unwrap_err().contains("Unsupported language"));
    }
}
