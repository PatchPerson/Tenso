use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: String,
    pub name: String,
    pub convex_team_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: String,
    pub team_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub sort_order: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HttpMethod(pub String);

impl HttpMethod {
    pub fn get() -> Self { Self("GET".into()) }
    pub fn post() -> Self { Self("POST".into()) }
    pub fn put() -> Self { Self("PUT".into()) }
    pub fn delete() -> Self { Self("DELETE".into()) }
    pub fn patch() -> Self { Self("PATCH".into()) }
    pub fn head() -> Self { Self("HEAD".into()) }
    pub fn options() -> Self { Self("OPTIONS".into()) }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyValue {
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "config")]
pub enum AuthConfig {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "bearer")]
    Bearer { token: String },
    #[serde(rename = "api_key")]
    ApiKey { key: String, value: String, add_to: String },
    #[serde(rename = "basic")]
    Basic { username: String, password: String },
}

impl Default for AuthConfig {
    fn default() -> Self { Self::None }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum RequestBody {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "raw")]
    Raw { content: String, content_type: String },
    #[serde(rename = "json")]
    Json { content: String },
    #[serde(rename = "form_urlencoded")]
    FormUrlEncoded { params: Vec<KeyValue> },
    #[serde(rename = "form_data")]
    FormData { params: Vec<FormDataParam> },
    #[serde(rename = "binary")]
    Binary { path: String },
    #[serde(rename = "graphql")]
    GraphQL { query: String, variables: String },
}

impl Default for RequestBody {
    fn default() -> Self { Self::None }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormDataParam {
    pub key: String,
    pub value: String,
    pub param_type: String, // "text" or "file"
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedRequest {
    pub id: String,
    pub collection_id: String,
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub params: Vec<KeyValue>,
    pub body: RequestBody,
    pub auth: AuthConfig,
    pub pre_script: String,
    pub post_script: String,
    pub sort_order: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Environment {
    pub id: String,
    pub team_id: String,
    pub name: String,
    pub variables: Vec<KeyValue>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub team_id: String,
    pub method: String,
    pub url: String,
    pub status: u16,
    pub duration_ms: u64,
    pub response_size: u64,
    pub timestamp: String,
    pub request_data: String,  // JSON blob of full request
    pub response_headers: String, // JSON
    pub response_body_preview: String, // first 1KB
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSocketConnection {
    pub id: String,
    pub team_id: String,
    pub name: String,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimingBreakdown {
    pub dns_ms: u64,
    pub connect_ms: u64,
    pub tls_ms: u64,
    pub first_byte_ms: u64,
    pub total_ms: u64,
    pub download_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<KeyValue>,
    pub body: String,
    pub size_bytes: u64,
    pub timing: TimingBreakdown,
}
