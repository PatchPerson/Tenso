use tenso_shared::models::*;

pub fn parse_curl(input: &str) -> Result<SavedRequest, String> {
    let input = input.trim();
    let input = if input.starts_with("curl") {
        &input[4..]
    } else {
        input
    };
    let input = input.trim();

    let mut method = "GET".to_string();
    let mut url = String::new();
    let mut headers: Vec<KeyValue> = vec![];
    let mut body = RequestBody::None;

    let parts = shell_words::split(input).map_err(|e| format!("Failed to parse: {}", e))?;
    let mut i = 0;
    while i < parts.len() {
        let part = &parts[i];
        match part.as_str() {
            "-X" | "--request" => {
                i += 1;
                if i < parts.len() {
                    method = parts[i].to_uppercase();
                }
            }
            "-H" | "--header" => {
                i += 1;
                if i < parts.len() {
                    if let Some((k, v)) = parts[i].split_once(':') {
                        headers.push(KeyValue {
                            key: k.trim().to_string(),
                            value: v.trim().to_string(),
                            enabled: true,
                        });
                    }
                }
            }
            "-d" | "--data" | "--data-raw" | "--data-binary" => {
                i += 1;
                if i < parts.len() {
                    let data = &parts[i];
                    // Try to detect if it's JSON
                    if data.starts_with('{') || data.starts_with('[') {
                        body = RequestBody::Json { content: data.clone() };
                        if method == "GET" { method = "POST".to_string(); }
                    } else {
                        body = RequestBody::Raw { content: data.clone(), content_type: "text/plain".into() };
                        if method == "GET" { method = "POST".to_string(); }
                    }
                }
            }
            "--data-urlencode" => {
                i += 1;
                // Handle form urlencoded
                if method == "GET" { method = "POST".to_string(); }
            }
            "-u" | "--user" => {
                i += 1;
                // Basic auth handled separately
            }
            s if !s.starts_with('-') && url.is_empty() => {
                url = s.to_string();
            }
            _ => {}
        }
        i += 1;
    }

    if url.is_empty() {
        return Err("No URL found in curl command".into());
    }

    // Extract query params from URL into params array (params is the canonical source
    // for query parameters — the backend strips query from URL and rebuilds from params)
    let mut params: Vec<KeyValue> = vec![];
    let base_url = if let Ok(parsed) = reqwest::Url::parse(&url) {
        for (k, v) in parsed.query_pairs() {
            params.push(KeyValue {
                key: k.into_owned(),
                value: v.into_owned(),
                enabled: true,
            });
        }
        // URL without query string
        let mut clean = parsed.clone();
        clean.set_query(None);
        clean.to_string()
    } else {
        url.clone()
    };

    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    Ok(SavedRequest {
        id,
        collection_id: String::new(),
        name: format!("{} {}", method, base_url),
        method,
        url,
        headers,
        params,
        body,
        auth: AuthConfig::None,
        pre_script: String::new(),
        post_script: String::new(),
        ws_messages: vec![],
        sort_order: 0.0,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_get() {
        let r = parse_curl("curl https://api.example.com/users").unwrap();
        assert_eq!(r.method, "GET");
        assert!(r.url.contains("api.example.com/users"));
        assert!(r.params.is_empty());
        assert!(r.headers.is_empty());
        assert!(matches!(r.body, RequestBody::None));
        assert!(matches!(r.auth, AuthConfig::None));
    }

    #[test]
    fn explicit_method_short_flag() {
        let r = parse_curl("curl -X POST https://example.com").unwrap();
        assert_eq!(r.method, "POST");
    }

    #[test]
    fn explicit_method_long_flag() {
        let r = parse_curl("curl --request DELETE https://example.com").unwrap();
        assert_eq!(r.method, "DELETE");
    }

    #[test]
    fn case_insensitive_method() {
        let r = parse_curl("curl -X put https://example.com").unwrap();
        assert_eq!(r.method, "PUT");
    }

    #[test]
    fn headers_parsed() {
        let r = parse_curl(
            "curl -H 'Content-Type: application/json' -H 'Authorization: Bearer tok' https://example.com"
        ).unwrap();
        assert_eq!(r.headers.len(), 2);
        assert_eq!(r.headers[0].key, "Content-Type");
        assert_eq!(r.headers[0].value, "application/json");
        assert_eq!(r.headers[1].key, "Authorization");
        assert_eq!(r.headers[1].value, "Bearer tok");
        assert!(r.headers[0].enabled);
    }

    #[test]
    fn json_body_auto_promotes_to_post() {
        let r = parse_curl(r#"curl -d '{"key":"val"}' https://example.com"#).unwrap();
        assert_eq!(r.method, "POST");
        match &r.body {
            RequestBody::Json { content } => assert!(content.contains("key")),
            other => panic!("expected Json body, got {:?}", other),
        }
    }

    #[test]
    fn explicit_method_not_overridden_by_body() {
        let r = parse_curl(r#"curl -X PUT -d '{"key":"val"}' https://example.com"#).unwrap();
        assert_eq!(r.method, "PUT");
    }

    #[test]
    fn non_json_body_is_raw() {
        let r = parse_curl("curl -d 'plain text' https://example.com").unwrap();
        assert_eq!(r.method, "POST");
        match &r.body {
            RequestBody::Raw { content, content_type } => {
                assert_eq!(content, "plain text");
                assert_eq!(content_type, "text/plain");
            }
            other => panic!("expected Raw body, got {:?}", other),
        }
    }

    #[test]
    fn query_params_extracted_to_params_array() {
        let r = parse_curl("curl 'https://example.com/api?foo=bar&baz=qux'").unwrap();
        assert_eq!(r.params.len(), 2);
        assert_eq!(r.params[0].key, "foo");
        assert_eq!(r.params[0].value, "bar");
        assert_eq!(r.params[1].key, "baz");
        assert_eq!(r.params[1].value, "qux");
        assert!(r.params[0].enabled);
    }

    #[test]
    fn url_retains_original_with_query() {
        let r = parse_curl("curl 'https://example.com/api?foo=bar'").unwrap();
        assert!(r.url.contains("foo=bar"));
    }

    #[test]
    fn name_uses_base_url_without_query() {
        let r = parse_curl("curl 'https://example.com/api?foo=bar'").unwrap();
        assert!(r.name.starts_with("GET"));
        assert!(r.name.contains("example.com/api"));
        assert!(!r.name.contains("foo=bar"));
    }

    #[test]
    fn url_without_query_has_empty_params() {
        let r = parse_curl("curl https://example.com/path").unwrap();
        assert!(r.params.is_empty());
    }

    #[test]
    fn no_url_returns_error() {
        let r = parse_curl("curl -H 'Foo: bar'");
        assert!(r.is_err());
        assert!(r.unwrap_err().contains("No URL found"));
    }

    #[test]
    fn data_raw_variant_parses_json() {
        let r = parse_curl(r#"curl --data-raw '{"a":1}' https://example.com"#).unwrap();
        assert!(matches!(r.body, RequestBody::Json { .. }));
    }

    #[test]
    fn data_binary_variant_parses_json() {
        let r = parse_curl(r#"curl --data-binary '{"a":1}' https://example.com"#).unwrap();
        assert!(matches!(r.body, RequestBody::Json { .. }));
    }

    #[test]
    fn without_curl_prefix() {
        let r = parse_curl("https://example.com").unwrap();
        assert_eq!(r.method, "GET");
        assert!(r.url.contains("example.com"));
    }
}
