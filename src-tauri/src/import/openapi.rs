use crate::state::AppState;
use reqlite_shared::models::*;

pub async fn import_openapi_spec(
    state: &AppState,
    spec_json: &str,
    team_id: &str,
) -> Result<Vec<Collection>, String> {
    let spec: openapiv3::OpenAPI = serde_json::from_str(spec_json)
        .map_err(|e| format!("Invalid OpenAPI spec: {}", e))?;

    let title = spec.info.title.clone();
    let root_collection = state.db.create_collection(team_id, None, &title)
        .map_err(|e| e.to_string())?;

    let collections = vec![root_collection.clone()];

    for (path, path_item) in &spec.paths.paths {
        if let openapiv3::ReferenceOr::Item(item) = path_item {
            let methods = [
                ("GET", &item.get),
                ("POST", &item.post),
                ("PUT", &item.put),
                ("DELETE", &item.delete),
                ("PATCH", &item.patch),
            ];

            for (method, op) in methods {
                if let Some(operation) = op {
                    let name = operation.summary.clone()
                        .or_else(|| operation.operation_id.clone())
                        .unwrap_or_else(|| format!("{} {}", method, path));

                    let base_url = spec.servers.first()
                        .map(|s| s.url.clone())
                        .unwrap_or_default();

                    let url = format!("{}{}", base_url, path);

                    let _ = state.db.create_request(
                        &root_collection.id,
                        &name,
                        method,
                        &url,
                    );
                }
            }
        }
    }

    Ok(collections)
}
