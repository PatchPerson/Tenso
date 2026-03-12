use crate::state::AppState;
use tenso_shared::models::*;
use std::sync::Arc;
use std::time::Instant;

/// Resolve a string by replacing `{{var}}` placeholders with environment variable values.
fn resolve(s: &str, env_vars: &[KeyValue]) -> String {
    let mut result = s.to_string();
    for var in env_vars {
        if var.enabled {
            result = result.replace(&format!("{{{{{}}}}}", var.key), &var.value);
        }
    }
    result
}

/// Load the active environment's variables and resolve the URL (with query params rebuilt
/// from the canonical `params` array).
fn resolve_variables(
    state: &AppState,
    team_id: &str,
    url: &str,
    params: &[KeyValue],
) -> Result<(reqwest::Url, Vec<KeyValue>), String> {
    let active_env = state.active_environment.read().unwrap().clone();
    let env_vars = if let Some(env_id) = &active_env {
        state.db.list_environments(team_id)
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|e| e.id == *env_id)
            .map(|e| e.variables)
            .unwrap_or_default()
    } else {
        vec![]
    };

    let resolved_url = resolve(url, &env_vars);

    // INVARIANT: `params` is the canonical source of query parameters. The URL may
    // contain a query string (the frontend syncs params into the URL bidirectionally),
    // so we strip it before rebuilding from `params` to avoid duplication.
    let mut url_with_params = reqwest::Url::parse(&resolved_url)
        .map_err(|e| format!("Invalid URL: {}", e))?;
    url_with_params.set_query(None);
    for p in params {
        if p.enabled {
            url_with_params
                .query_pairs_mut()
                .append_pair(&resolve(&p.key, &env_vars), &resolve(&p.value, &env_vars));
        }
    }

    Ok((url_with_params, env_vars))
}

/// Build the request body onto the given `reqwest::RequestBuilder`, returning the
/// modified builder.
fn build_request_body(
    mut req_builder: reqwest::RequestBuilder,
    body: &RequestBody,
    env_vars: &[KeyValue],
) -> Result<reqwest::RequestBuilder, String> {
    match body {
        RequestBody::None => {}
        RequestBody::Raw { content, content_type } => {
            req_builder = req_builder
                .header("Content-Type", content_type.as_str())
                .body(resolve(content, env_vars));
        }
        RequestBody::Json { content } => {
            req_builder = req_builder
                .header("Content-Type", "application/json")
                .body(resolve(content, env_vars));
        }
        RequestBody::FormUrlEncoded { params: form_params } => {
            let pairs: Vec<(String, String)> = form_params
                .iter()
                .filter(|p| p.enabled)
                .map(|p| (resolve(&p.key, env_vars), resolve(&p.value, env_vars)))
                .collect();
            req_builder = req_builder.form(&pairs);
        }
        RequestBody::FormData { params: form_params } => {
            let mut form = reqwest::multipart::Form::new();
            for p in form_params {
                if p.enabled {
                    if p.param_type == "file" {
                        let bytes = std::fs::read(&p.value)
                            .map_err(|e| format!("Failed to read file: {}", e))?;
                        let part = reqwest::multipart::Part::bytes(bytes).file_name(
                            std::path::Path::new(&p.value)
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string(),
                        );
                        form = form.part(resolve(&p.key, env_vars), part);
                    } else {
                        form = form.text(resolve(&p.key, env_vars), resolve(&p.value, env_vars));
                    }
                }
            }
            req_builder = req_builder.multipart(form);
        }
        RequestBody::Binary { path } => {
            let bytes =
                std::fs::read(path).map_err(|e| format!("Failed to read file: {}", e))?;
            req_builder = req_builder.body(bytes);
        }
        RequestBody::GraphQL { query, variables } => {
            let gql = serde_json::json!({
                "query": resolve(query, env_vars),
                "variables": resolve(variables, env_vars),
            });
            req_builder = req_builder
                .header("Content-Type", "application/json")
                .body(gql.to_string());
        }
    }
    Ok(req_builder)
}

/// Send the request, collect the response, save to history, and return `HttpResponse`.
async fn execute_and_collect(
    req_builder: reqwest::RequestBuilder,
    state: &AppState,
    method: &str,
    url: &str,
    headers: &[KeyValue],
    params: &[KeyValue],
    body: &RequestBody,
    auth: &AuthConfig,
    team_id: &str,
) -> Result<HttpResponse, String> {
    let start = Instant::now();
    let response = req_builder.send().await.map_err(|e| e.to_string())?;
    let first_byte = start.elapsed().as_millis() as u64;

    let status = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let resp_headers: Vec<KeyValue> = response
        .headers()
        .iter()
        .map(|(k, v)| KeyValue {
            key: k.to_string(),
            value: v.to_str().unwrap_or("").to_string(),
            enabled: true,
        })
        .collect();

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
        team_id: team_id.to_string(),
        method: method.to_string(),
        url: url.to_string(),
        status,
        duration_ms: total,
        response_size: size_bytes,
        timestamp: chrono::Utc::now().to_rfc3339(),
        request_data: serde_json::json!({
            "headers": headers,
            "params": params,
            "body": body,
            "auth": auth,
        })
        .to_string(),
        response_headers: serde_json::to_string(&resp_headers).unwrap_or_default(),
        response_body_preview: body_text.chars().take(1024).collect(),
        response_body: if body_text.len() <= 10_000_000 {
            body_text.clone()
        } else {
            String::new()
        },
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
    // Resolve environment variables and build final URL
    let (url_with_params, env_vars) = resolve_variables(&state, &team_id, &url, &params)?;

    // Build request
    let method_parsed = method.parse::<reqwest::Method>().map_err(|e| e.to_string())?;
    let mut req_builder = state.http_client.request(method_parsed, url_with_params);

    // Add headers
    for h in &headers {
        if h.enabled {
            req_builder = req_builder.header(
                &resolve(&h.key, &env_vars),
                &resolve(&h.value, &env_vars),
            );
        }
    }

    // Add auth
    match &auth {
        AuthConfig::None => {}
        AuthConfig::Bearer { token } => {
            req_builder = req_builder.bearer_auth(&resolve(token, &env_vars));
        }
        AuthConfig::ApiKey { key, value, add_to } => {
            if add_to == "header" {
                req_builder = req_builder.header(
                    &resolve(key, &env_vars),
                    &resolve(value, &env_vars),
                );
            }
            // query param case handled by adding to params
        }
        AuthConfig::Basic { username, password } => {
            req_builder = req_builder.basic_auth(
                &resolve(username, &env_vars),
                Some(&resolve(password, &env_vars)),
            );
        }
    }

    // Add body
    req_builder = build_request_body(req_builder, &body, &env_vars)?;

    // Execute, collect response, save history
    execute_and_collect(
        req_builder, &state, &method, &url, &headers, &params, &body, &auth, &team_id,
    )
    .await
}
