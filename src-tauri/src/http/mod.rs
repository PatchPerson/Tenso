// HTTP client utilities - the main logic is in commands/http.rs
// This module provides additional helpers for connection pooling and timing

pub mod timing {
    use tenso_shared::models::TimingBreakdown;

    pub fn empty_timing() -> TimingBreakdown {
        TimingBreakdown {
            dns_ms: 0,
            connect_ms: 0,
            tls_ms: 0,
            first_byte_ms: 0,
            total_ms: 0,
            download_ms: 0,
        }
    }
}
