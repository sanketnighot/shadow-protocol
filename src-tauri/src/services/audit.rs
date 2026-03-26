use serde::Serialize;

use super::local_db::{self, AuditLogEntry};

pub fn record<T: Serialize>(
    event_type: &str,
    subject_type: &str,
    subject_id: Option<&str>,
    details: &T,
) {
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let entry = AuditLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        event_type: event_type.to_string(),
        subject_type: subject_type.to_string(),
        subject_id: subject_id.map(str::to_string),
        details_json: serde_json::to_string(details).unwrap_or_else(|_| "{}".to_string()),
        created_at,
    };
    let _ = local_db::insert_audit_log(&entry);
}
