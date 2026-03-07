use crate::state::AppState;
use tenso_shared::models::*;
use std::sync::Arc;
use std::time::Instant;

#[tauri::command]
pub async fn send_request(
    state: tauri::State<'_, Arc<AppState>>,
    method: String,
    url: String,
    headers: Vec<KeyValue>,
    params: Vec<KeyValue>,
    body: RequestBody,
    auth: AuthConfig,
    team_id: String,
) -> Result<HttpResponse, String> {
    // Resolve environment variables
    let active_env = state.active_environment.read().unwrap().clone();
    let env_vars = if let Some(env_id) = &active_env {
        state.db.list_environments(&team_id)
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|e| e.id == *env_id)
            .map(|e| e.variables)
            .unwrap_or_default()
    } else {
        vec![]
    };

    let resolve = |s: &str| -> String {
        let mut result = s.to_string();
        for var in &env_vars {
            if var.enabled {
                result = result.replace(&format!("{{{{{}}}}}", var.key), &var.value);
            }
        }
        result
    };

    let resolved_url = resolve(&url);

    // Build URL with query params (strip any existing query string since params array is the source of truth)
    let mut url_with_params = reqwest::Url::parse(&resolved_url).map_err(|e| format!("Invalid URL: {}", e))?;
    url_with_params.set_query(None);
    for p in &params {
        if p.enabled {
            url_with_params.query_pairs_mut().append_pair(&resolve(&p.key), &resolve(&p.value));
        }
    }

    // Build request
    let method_parsed = method.parse::<reqwest::Method>().map_err(|e| e.to_string())?;
    let mut req_builder = state.http_client.request(method_parsed, url_with_params);

    // Add headers
    for h in &headers {
        if h.enabled {
            req_builder = req_builder.header(&resolve(&h.key), &resolve(&h.value));
        }
    }

    // Add auth
    match &auth {
        AuthConfig::None => {}
        AuthConfig::Bearer { token } => {
            req_builder = req_builder.bearer_auth(&resolve(token));
        }
        AuthConfig::ApiKey { key, value, add_to } => {
            if add_to == "header" {
                req_builder = req_builder.header(&resolve(key), &resolve(value));
            }
            // query param case handled by adding to params
        }
        AuthConfig::Basic { username, password } => {
            req_builder = req_builder.basic_auth(&resolve(username), Some(&resolve(password)));
        }
    }

    // Add body
    match &body {
        RequestBody::None => {}
        RequestBody::Raw { content, content_type } => {
            req_builder = req_builder.header("Content-Type", content_type.as_str()).body(resolve(content));
        }
        RequestBody::Json { content } => {
            req_builder = req_builder.header("Content-Type", "application/json").body(resolve(content));
        }
        RequestBody::FormUrlEncoded { params: form_params } => {
            let pairs: Vec<(String, String)> = form_params.iter()
                .filter(|p| p.enabled)
                .map(|p| (resolve(&p.key), resolve(&p.value)))
                .collect();
            req_builder = req_builder.form(&pairs);
        }
        RequestBody::FormData { params: form_params } => {
            let mut form = reqwest::multipart::Form::new();
            for p in form_params {
                if p.enabled {
                    if p.param_type == "file" {
                        let bytes = std::fs::read(&p.value).map_err(|e| format!("Failed to read file: {}", e))?;
                        let part = reqwest::multipart::Part::bytes(bytes)
                            .file_name(std::path::Path::new(&p.value).file_name().unwrap_or_default().to_string_lossy().to_string());
                        form = form.part(resolve(&p.key), part);
                    } else {
                        form = form.text(resolve(&p.key), resolve(&p.value));
                    }
                }
            }
            req_builder = req_builder.multipart(form);
        }
        RequestBody::Binary { path } => {
            let bytes = std::fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
            req_builder = req_builder.body(bytes);
        }
        RequestBody::GraphQL { query, variables } => {
            let gql = serde_json::json!({ "query": resolve(query), "variables": resolve(variables) });
            req_builder = req_builder.header("Content-Type", "application/json").body(gql.to_string());
        }
    }

    // Execute with timing
    let start = Instant::now();
    let response = req_builder.send().await.map_err(|e| e.to_string())?;
    let first_byte = start.elapsed().as_millis() as u64;

    let status = response.status().as_u16();
    let status_text = response.status().canonical_reason().unwrap_or("").to_string();

    let resp_headers: Vec<KeyValue> = response.headers().iter().map(|(k, v)| KeyValue {
        key: k.to_string(),
        value: v.to_str().unwrap_or("").to_string(),
        enabled: true,
    }).collect();

    let body_bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let total = start.elapsed().as_millis() as u64;
    let size_bytes = body_bytes.len() as u64;
    let body_text = String::from_utf8_lossy(&body_bytes).to_string();

    let timing = TimingBreakdown {
        dns_ms: 0,
        connect_ms: 0,
        tls_ms: 0,
        first_byte_ms: first_byte,
        total_ms: total,
        download_ms: total.saturating_sub(first_byte),
    };

    // Save to history
    let history_entry = HistoryEntry {
        id: ulid::Ulid::new().to_string(),
        team_id: team_id.clone(),
        method: method.clone(),
        url: url.clone(),
        status,
        duration_ms: total,
        response_size: size_bytes,
        timestamp: chrono::Utc::now().to_rfc3339(),
        request_data: serde_json::json!({
            "headers": headers,
            "params": params,
            "body": body,
            "auth": auth,
        }).to_string(),
        response_headers: serde_json::to_string(&resp_headers).unwrap_or_default(),
        response_body_preview: body_text.chars().take(1024).collect(),
        response_body: if body_text.len() <= 10_000_000 { body_text.clone() } else { String::new() },
    };
    let _ = state.db.add_history(&history_entry);

    Ok(HttpResponse {
        status,
        status_text,
        headers: resp_headers,
        body: body_text,
        size_bytes,
        timing,
    })
}
