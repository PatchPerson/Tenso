use tenso_shared::models::*;
use serde::Deserialize;
use serde_json::Value;
use super::ImportedCollection;

/// Postman Collection v2.1 format structures
#[derive(Deserialize)]
struct PostmanCollection {
    info: PostmanInfo,
    item: Vec<PostmanItem>,
    variable: Option<Vec<PostmanVariable>>,
}

#[derive(Deserialize)]
struct PostmanInfo {
    name: String,
    #[serde(default)]
    #[allow(dead_code)]
    description: Option<String>,
}

#[derive(Deserialize)]
struct PostmanItem {
    name: String,
    /// If present, this is a folder containing sub-items
    item: Option<Vec<PostmanItem>>,
    /// If present, this is a request
    request: Option<PostmanRequest>,
}

#[derive(Deserialize)]
struct PostmanRequest {
    method: Option<String>,
    header: Option<Vec<PostmanHeader>>,
    url: Option<PostmanUrl>,
    body: Option<PostmanBody>,
    auth: Option<PostmanAuth>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum PostmanUrl {
    Simple(String),
    Detailed(PostmanUrlDetailed),
}

#[derive(Deserialize)]
struct PostmanUrlDetailed {
    raw: Option<String>,
    query: Option<Vec<PostmanQueryParam>>,
}

#[derive(Deserialize)]
struct PostmanQueryParam {
    key: Option<String>,
    value: Option<String>,
    disabled: Option<bool>,
}

#[derive(Deserialize)]
struct PostmanHeader {
    key: String,
    value: String,
    disabled: Option<bool>,
}

#[derive(Deserialize)]
struct PostmanBody {
    mode: Option<String>,
    raw: Option<String>,
    urlencoded: Option<Vec<PostmanFormParam>>,
    formdata: Option<Vec<PostmanFormParam>>,
    graphql: Option<PostmanGraphql>,
}

#[derive(Deserialize)]
struct PostmanFormParam {
    key: String,
    value: Option<String>,
    #[serde(rename = "type")]
    param_type: Option<String>,
    disabled: Option<bool>,
}

#[derive(Deserialize)]
struct PostmanGraphql {
    query: Option<String>,
    variables: Option<String>,
}

#[derive(Deserialize)]
struct PostmanAuth {
    #[serde(rename = "type")]
    auth_type: Option<String>,
    bearer: Option<Vec<PostmanAuthKV>>,
    basic: Option<Vec<PostmanAuthKV>>,
    apikey: Option<Vec<PostmanAuthKV>>,
}

#[derive(Deserialize)]
struct PostmanAuthKV {
    key: String,
    value: Option<Value>,
}

#[derive(Deserialize)]
struct PostmanVariable {
    key: String,
    value: Option<String>,
}

pub fn parse_postman_collection(json: &str) -> Result<super::ImportedCollection, String> {
    let collection: PostmanCollection = serde_json::from_str(json)
        .map_err(|e| format!("Invalid Postman collection JSON: {}", e))?;

    let variables: Vec<KeyValue> = collection.variable.unwrap_or_default().iter().map(|v| {
        KeyValue {
            key: v.key.clone(),
            value: v.value.clone().unwrap_or_default(),
            enabled: true,
        }
    }).collect();

    let (children, requests) = parse_items(&collection.item);

    Ok(ImportedCollection {
        name: collection.info.name,
        children,
        requests,
        variables,
    })
}

fn parse_items(items: &[PostmanItem]) -> (Vec<ImportedCollection>, Vec<SavedRequest>) {
    let mut folders = Vec::new();
    let mut requests = Vec::new();

    for item in items {
        if item.item.is_some() {
            // This is a folder
            let sub_items = item.item.as_ref().unwrap();
            let (sub_folders, sub_requests) = parse_items(sub_items);
            folders.push(ImportedCollection {
                name: item.name.clone(),
                children: sub_folders,
                requests: sub_requests,
                variables: vec![],
            });
        } else if let Some(ref req) = item.request {
            // This is a request
            if let Some(saved) = convert_request(&item.name, req) {
                requests.push(saved);
            }
        }
    }

    (folders, requests)
}

fn convert_request(name: &str, req: &PostmanRequest) -> Option<SavedRequest> {
    let method = req.method.clone().unwrap_or_else(|| "GET".into()).to_uppercase();

    let url = match &req.url {
        Some(PostmanUrl::Simple(s)) => s.clone(),
        Some(PostmanUrl::Detailed(d)) => d.raw.clone().unwrap_or_default(),
        None => String::new(),
    };

    let headers: Vec<KeyValue> = req.header.as_ref().unwrap_or(&vec![]).iter().map(|h| {
        KeyValue {
            key: h.key.clone(),
            value: h.value.clone(),
            enabled: !h.disabled.unwrap_or(false),
        }
    }).collect();

    let params: Vec<KeyValue> = match &req.url {
        Some(PostmanUrl::Detailed(d)) => {
            d.query.as_ref().unwrap_or(&vec![]).iter().map(|q| {
                KeyValue {
                    key: q.key.clone().unwrap_or_default(),
                    value: q.value.clone().unwrap_or_default(),
                    enabled: !q.disabled.unwrap_or(false),
                }
            }).collect()
        }
        _ => vec![],
    };

    let body = convert_body(req.body.as_ref());
    let auth = convert_auth(req.auth.as_ref());

    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    Some(SavedRequest {
        id,
        collection_id: String::new(),
        name: name.to_string(),
        method,
        url,
        headers,
        params,
        body,
        auth,
        pre_script: String::new(),
        post_script: String::new(),
        ws_messages: vec![],
        sort_order: 0.0,
        created_at: now.clone(),
        updated_at: now,
    })
}

fn convert_body(body: Option<&PostmanBody>) -> RequestBody {
    let body = match body {
        Some(b) => b,
        None => return RequestBody::None,
    };

    match body.mode.as_deref() {
        Some("raw") => {
            let content = body.raw.clone().unwrap_or_default();
            // Try to detect JSON
            let trimmed = content.trim();
            if (trimmed.starts_with('{') && trimmed.ends_with('}'))
                || (trimmed.starts_with('[') && trimmed.ends_with(']'))
            {
                RequestBody::Json { content }
            } else {
                RequestBody::Raw {
                    content,
                    content_type: "text/plain".into(),
                }
            }
        }
        Some("urlencoded") => {
            let params = body.urlencoded.as_ref().unwrap_or(&vec![]).iter().map(|p| {
                KeyValue {
                    key: p.key.clone(),
                    value: p.value.clone().unwrap_or_default(),
                    enabled: !p.disabled.unwrap_or(false),
                }
            }).collect();
            RequestBody::FormUrlEncoded { params }
        }
        Some("formdata") => {
            let params = body.formdata.as_ref().unwrap_or(&vec![]).iter().map(|p| {
                FormDataParam {
                    key: p.key.clone(),
                    value: p.value.clone().unwrap_or_default(),
                    param_type: p.param_type.clone().unwrap_or_else(|| "text".into()),
                    enabled: !p.disabled.unwrap_or(false),
                }
            }).collect();
            RequestBody::FormData { params }
        }
        Some("graphql") => {
            if let Some(ref gql) = body.graphql {
                RequestBody::GraphQL {
                    query: gql.query.clone().unwrap_or_default(),
                    variables: gql.variables.clone().unwrap_or_else(|| "{}".into()),
                }
            } else {
                RequestBody::None
            }
        }
        _ => RequestBody::None,
    }
}

fn convert_auth(auth: Option<&PostmanAuth>) -> AuthConfig {
    let auth = match auth {
        Some(a) => a,
        None => return AuthConfig::None,
    };

    match auth.auth_type.as_deref() {
        Some("bearer") => {
            let token = auth.bearer.as_ref()
                .and_then(|items| items.iter().find(|kv| kv.key == "token"))
                .and_then(|kv| kv.value.as_ref())
                .map(|v| match v {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
                .unwrap_or_default();
            AuthConfig::Bearer { token }
        }
        Some("basic") => {
            let items = auth.basic.as_ref();
            let username = items
                .and_then(|i| i.iter().find(|kv| kv.key == "username"))
                .and_then(|kv| kv.value.as_ref())
                .map(|v| match v { Value::String(s) => s.clone(), o => o.to_string() })
                .unwrap_or_default();
            let password = items
                .and_then(|i| i.iter().find(|kv| kv.key == "password"))
                .and_then(|kv| kv.value.as_ref())
                .map(|v| match v { Value::String(s) => s.clone(), o => o.to_string() })
                .unwrap_or_default();
            AuthConfig::Basic { username, password }
        }
        Some("apikey") => {
            let items = auth.apikey.as_ref();
            let key = items
                .and_then(|i| i.iter().find(|kv| kv.key == "key"))
                .and_then(|kv| kv.value.as_ref())
                .map(|v| match v { Value::String(s) => s.clone(), o => o.to_string() })
                .unwrap_or_default();
            let value = items
                .and_then(|i| i.iter().find(|kv| kv.key == "value"))
                .and_then(|kv| kv.value.as_ref())
                .map(|v| match v { Value::String(s) => s.clone(), o => o.to_string() })
                .unwrap_or_default();
            let add_to = items
                .and_then(|i| i.iter().find(|kv| kv.key == "in"))
                .and_then(|kv| kv.value.as_ref())
                .map(|v| match v { Value::String(s) => s.clone(), o => o.to_string() })
                .unwrap_or_else(|| "header".into());
            AuthConfig::ApiKey { key, value, add_to }
        }
        _ => AuthConfig::None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn minimal_get_request() {
        let input = json!({
            "info": { "name": "My API" },
            "item": [{
                "name": "Get Users",
                "request": {
                    "method": "GET",
                    "url": "https://api.example.com/users"
                }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        assert_eq!(result.name, "My API");
        assert_eq!(result.requests.len(), 1);
        assert_eq!(result.requests[0].method, "GET");
        assert_eq!(result.requests[0].name, "Get Users");
        assert_eq!(result.requests[0].url, "https://api.example.com/users");
    }

    #[test]
    fn detailed_url_with_query_params() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "Search",
                "request": {
                    "method": "GET",
                    "url": {
                        "raw": "https://example.com/search?q=test",
                        "query": [
                            { "key": "q", "value": "test" },
                            { "key": "page", "value": "1" }
                        ]
                    }
                }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        let req = &result.requests[0];
        assert_eq!(req.params.len(), 2);
        assert_eq!(req.params[0].key, "q");
        assert_eq!(req.params[0].value, "test");
        assert_eq!(req.params[1].key, "page");
        assert!(req.params[0].enabled);
    }

    #[test]
    fn disabled_query_param() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "R1",
                "request": {
                    "method": "GET",
                    "url": {
                        "raw": "https://example.com",
                        "query": [{ "key": "debug", "value": "true", "disabled": true }]
                    }
                }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        assert!(!result.requests[0].params[0].enabled);
    }

    #[test]
    fn nested_folders() {
        let input = json!({
            "info": { "name": "API" },
            "item": [{
                "name": "Users",
                "item": [{
                    "name": "Get User",
                    "request": { "method": "GET", "url": "https://example.com/users/1" }
                }]
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        assert!(result.requests.is_empty());
        assert_eq!(result.children.len(), 1);
        assert_eq!(result.children[0].name, "Users");
        assert_eq!(result.children[0].requests.len(), 1);
        assert_eq!(result.children[0].requests[0].name, "Get User");
    }

    #[test]
    fn body_raw_json_detected() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "Create",
                "request": {
                    "method": "POST",
                    "url": "https://example.com",
                    "body": { "mode": "raw", "raw": "{\"name\": \"test\"}" }
                }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        assert!(matches!(result.requests[0].body, RequestBody::Json { .. }));
    }

    #[test]
    fn body_raw_text_not_json() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "Send",
                "request": {
                    "method": "POST",
                    "url": "https://example.com",
                    "body": { "mode": "raw", "raw": "Hello World" }
                }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        assert!(matches!(result.requests[0].body, RequestBody::Raw { .. }));
    }

    #[test]
    fn body_urlencoded() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "Login",
                "request": {
                    "method": "POST",
                    "url": "https://example.com/login",
                    "body": {
                        "mode": "urlencoded",
                        "urlencoded": [
                            { "key": "username", "value": "admin" },
                            { "key": "password", "value": "secret", "disabled": true }
                        ]
                    }
                }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        match &result.requests[0].body {
            RequestBody::FormUrlEncoded { params } => {
                assert_eq!(params.len(), 2);
                assert_eq!(params[0].key, "username");
                assert!(params[0].enabled);
                assert!(!params[1].enabled);
            }
            other => panic!("expected FormUrlEncoded, got {:?}", other),
        }
    }

    #[test]
    fn body_formdata() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "Upload",
                "request": {
                    "method": "POST",
                    "url": "https://example.com/upload",
                    "body": {
                        "mode": "formdata",
                        "formdata": [
                            { "key": "file", "value": "/path/to/file", "type": "file" },
                            { "key": "desc", "value": "my file" }
                        ]
                    }
                }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        match &result.requests[0].body {
            RequestBody::FormData { params } => {
                assert_eq!(params.len(), 2);
                assert_eq!(params[0].param_type, "file");
                assert_eq!(params[1].param_type, "text");
            }
            other => panic!("expected FormData, got {:?}", other),
        }
    }

    #[test]
    fn body_graphql() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "Query",
                "request": {
                    "method": "POST",
                    "url": "https://example.com/graphql",
                    "body": {
                        "mode": "graphql",
                        "graphql": { "query": "{ users { id } }", "variables": "{}" }
                    }
                }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        match &result.requests[0].body {
            RequestBody::GraphQL { query, variables } => {
                assert!(query.contains("users"));
                assert_eq!(variables, "{}");
            }
            other => panic!("expected GraphQL, got {:?}", other),
        }
    }

    #[test]
    fn auth_bearer() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "Protected",
                "request": {
                    "method": "GET",
                    "url": "https://example.com",
                    "auth": {
                        "type": "bearer",
                        "bearer": [{ "key": "token", "value": "my-token-123" }]
                    }
                }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        match &result.requests[0].auth {
            AuthConfig::Bearer { token } => assert_eq!(token, "my-token-123"),
            other => panic!("expected Bearer, got {:?}", other),
        }
    }

    #[test]
    fn auth_basic() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "Auth",
                "request": {
                    "method": "GET",
                    "url": "https://example.com",
                    "auth": {
                        "type": "basic",
                        "basic": [
                            { "key": "username", "value": "admin" },
                            { "key": "password", "value": "secret" }
                        ]
                    }
                }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        match &result.requests[0].auth {
            AuthConfig::Basic { username, password } => {
                assert_eq!(username, "admin");
                assert_eq!(password, "secret");
            }
            other => panic!("expected Basic, got {:?}", other),
        }
    }

    #[test]
    fn auth_apikey() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "API",
                "request": {
                    "method": "GET",
                    "url": "https://example.com",
                    "auth": {
                        "type": "apikey",
                        "apikey": [
                            { "key": "key", "value": "X-API-Key" },
                            { "key": "value", "value": "secret123" },
                            { "key": "in", "value": "header" }
                        ]
                    }
                }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        match &result.requests[0].auth {
            AuthConfig::ApiKey { key, value, add_to } => {
                assert_eq!(key, "X-API-Key");
                assert_eq!(value, "secret123");
                assert_eq!(add_to, "header");
            }
            other => panic!("expected ApiKey, got {:?}", other),
        }
    }

    #[test]
    fn disabled_headers() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "R",
                "request": {
                    "method": "GET",
                    "url": "https://example.com",
                    "header": [
                        { "key": "Accept", "value": "application/json" },
                        { "key": "X-Debug", "value": "true", "disabled": true }
                    ]
                }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        assert!(result.requests[0].headers[0].enabled);
        assert!(!result.requests[0].headers[1].enabled);
    }

    #[test]
    fn collection_variables() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [],
            "variable": [
                { "key": "base_url", "value": "https://api.example.com" },
                { "key": "api_key" }
            ]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        assert_eq!(result.variables.len(), 2);
        assert_eq!(result.variables[0].key, "base_url");
        assert_eq!(result.variables[0].value, "https://api.example.com");
        assert_eq!(result.variables[1].value, "");
    }

    #[test]
    fn no_body_returns_none() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "R",
                "request": { "method": "GET", "url": "https://example.com" }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        assert!(matches!(result.requests[0].body, RequestBody::None));
    }

    #[test]
    fn invalid_json_returns_error() {
        let result = parse_postman_collection("not valid json");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid Postman collection JSON"));
    }

    #[test]
    fn default_method_is_get() {
        let input = json!({
            "info": { "name": "Test" },
            "item": [{
                "name": "R",
                "request": { "url": "https://example.com" }
            }]
        }).to_string();

        let result = parse_postman_collection(&input).unwrap();
        assert_eq!(result.requests[0].method, "GET");
    }
}
