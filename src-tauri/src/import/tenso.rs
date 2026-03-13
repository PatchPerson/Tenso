use serde::Deserialize;
use tenso_shared::models::*;
use super::ImportedCollection;

#[derive(Deserialize)]
struct TensoExportFile {
    format: String,
    version: u32,
    collection: TensoExportCollection,
    #[serde(default)]
    environments: Vec<TensoExportEnvironment>,
}

#[derive(Deserialize)]
struct TensoExportCollection {
    name: String,
    #[serde(default)]
    children: Vec<TensoExportCollection>,
    #[serde(default)]
    requests: Vec<TensoExportRequest>,
}

#[derive(Deserialize)]
struct TensoExportRequest {
    name: String,
    method: String,
    url: String,
    #[serde(default)]
    headers: Vec<KeyValue>,
    #[serde(default)]
    params: Vec<KeyValue>,
    #[serde(default = "default_body")]
    body: RequestBody,
    #[serde(default)]
    auth: AuthConfig,
    #[serde(default)]
    pre_script: String,
    #[serde(default)]
    post_script: String,
    #[serde(default)]
    ws_messages: Vec<WsMessageTemplate>,
    #[serde(default)]
    sort_order: f64,
}

fn default_body() -> RequestBody {
    RequestBody::None
}

#[derive(Deserialize)]
struct TensoExportEnvironment {
    name: String,
    #[serde(default)]
    variables: Vec<KeyValue>,
}

pub fn parse_tenso_export(json: &str) -> Result<(ImportedCollection, Vec<Environment>), String> {
    let file: TensoExportFile = serde_json::from_str(json)
        .map_err(|e| format!("Invalid Tenso export JSON: {}", e))?;

    if file.format != "tenso" {
        return Err(format!("Unknown format: '{}', expected 'tenso'", file.format));
    }

    if file.version != 1 {
        return Err(format!("Unsupported version: {}, expected 1", file.version));
    }

    let collection = convert_collection(&file.collection);

    let environments: Vec<Environment> = file.environments.into_iter().map(|env| {
        Environment {
            id: String::new(),
            team_id: String::new(),
            name: env.name,
            variables: env.variables,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }).collect();

    Ok((collection, environments))
}

fn convert_collection(col: &TensoExportCollection) -> ImportedCollection {
    let requests: Vec<SavedRequest> = col.requests.iter().map(|r| {
        SavedRequest {
            id: String::new(),
            collection_id: String::new(),
            name: r.name.clone(),
            method: r.method.clone(),
            url: r.url.clone(),
            headers: r.headers.clone(),
            params: r.params.clone(),
            body: r.body.clone(),
            auth: r.auth.clone(),
            pre_script: r.pre_script.clone(),
            post_script: r.post_script.clone(),
            ws_messages: r.ws_messages.clone(),
            sort_order: r.sort_order,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }).collect();

    let children: Vec<ImportedCollection> = col.children.iter().map(convert_collection).collect();

    ImportedCollection {
        name: col.name.clone(),
        children,
        requests,
        variables: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn minimal_export(collection: serde_json::Value) -> String {
        json!({
            "format": "tenso",
            "version": 1,
            "collection": collection
        }).to_string()
    }

    #[test]
    fn valid_v1_with_request() {
        let input = minimal_export(json!({
            "name": "My Collection",
            "children": [],
            "requests": [{
                "name": "Get Users",
                "method": "GET",
                "url": "https://example.com/users"
            }]
        }));

        let (col, envs) = parse_tenso_export(&input).unwrap();
        assert_eq!(col.name, "My Collection");
        assert_eq!(col.requests.len(), 1);
        assert_eq!(col.requests[0].method, "GET");
        assert_eq!(col.requests[0].url, "https://example.com/users");
        assert!(envs.is_empty());
    }

    #[test]
    fn with_environments() {
        let input = json!({
            "format": "tenso",
            "version": 1,
            "collection": { "name": "Test", "children": [], "requests": [] },
            "environments": [{
                "name": "Dev",
                "variables": [{ "key": "base_url", "value": "http://localhost:3000", "enabled": true }]
            }]
        }).to_string();

        let (_, envs) = parse_tenso_export(&input).unwrap();
        assert_eq!(envs.len(), 1);
        assert_eq!(envs[0].name, "Dev");
        assert_eq!(envs[0].variables.len(), 1);
        assert_eq!(envs[0].variables[0].key, "base_url");
    }

    #[test]
    fn wrong_format_returns_error() {
        let input = json!({
            "format": "postman",
            "version": 1,
            "collection": { "name": "Test", "children": [], "requests": [] }
        }).to_string();

        let result = parse_tenso_export(&input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown format"));
    }

    #[test]
    fn wrong_version_returns_error() {
        let input = json!({
            "format": "tenso",
            "version": 2,
            "collection": { "name": "Test", "children": [], "requests": [] }
        }).to_string();

        let result = parse_tenso_export(&input);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unsupported version"));
    }

    #[test]
    fn nested_children() {
        let input = minimal_export(json!({
            "name": "Root",
            "children": [{
                "name": "Sub",
                "children": [],
                "requests": [{ "name": "R1", "method": "POST", "url": "https://example.com" }]
            }],
            "requests": []
        }));

        let (col, _) = parse_tenso_export(&input).unwrap();
        assert_eq!(col.children.len(), 1);
        assert_eq!(col.children[0].name, "Sub");
        assert_eq!(col.children[0].requests.len(), 1);
    }

    #[test]
    fn invalid_json_returns_error() {
        let result = parse_tenso_export("not json");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid Tenso export JSON"));
    }

    #[test]
    fn request_preserves_optional_fields() {
        let input = minimal_export(json!({
            "name": "Test",
            "children": [],
            "requests": [{
                "name": "Full Request",
                "method": "POST",
                "url": "https://example.com",
                "headers": [{ "key": "Accept", "value": "application/json", "enabled": true }],
                "params": [{ "key": "q", "value": "test", "enabled": true }],
                "pre_script": "console.log('pre')",
                "post_script": "console.log('post')"
            }]
        }));

        let (col, _) = parse_tenso_export(&input).unwrap();
        let req = &col.requests[0];
        assert_eq!(req.headers.len(), 1);
        assert_eq!(req.params.len(), 1);
        assert_eq!(req.pre_script, "console.log('pre')");
        assert_eq!(req.post_script, "console.log('post')");
    }
}
