use tenso_shared::models::*;
use serde::Deserialize;
use serde_json::Value;

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

/// Result of parsing a Postman collection - a tree of folders and requests
#[derive(Debug, Clone, serde::Serialize)]
pub struct ImportedCollection {
    pub name: String,
    pub children: Vec<ImportedCollection>,
    pub requests: Vec<SavedRequest>,
    pub variables: Vec<KeyValue>,
}

pub fn parse_postman_collection(json: &str) -> Result<ImportedCollection, String> {
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
