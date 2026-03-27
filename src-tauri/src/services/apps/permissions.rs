//! Install-time and runtime permission checks against manifest + `app_permissions` rows.

use serde_json::Value;

use super::registry;
use super::state;

use crate::services::local_db::DbError;

pub fn manifest_permission_ids_for_app(app_id: &str) -> Result<Vec<String>, String> {
    let entries = state::list_marketplace().map_err(|e: DbError| e.to_string())?;
    let entry = entries
        .into_iter()
        .find(|e| e.catalog.id == app_id)
        .ok_or_else(|| "Unknown app".to_string())?;
    let v: Value = serde_json::from_str(&entry.catalog.permissions_json)
        .map_err(|_| "Invalid permissions manifest".to_string())?;
    let arr = v
        .as_array()
        .ok_or_else(|| "Invalid permissions manifest".to_string())?;
    Ok(arr
        .iter()
        .filter_map(|x| x.as_str().map(|s| s.to_string()))
        .collect())
}

pub fn grant_manifest_permissions(app_id: &str) -> Result<(), String> {
    let ids = manifest_permission_ids_for_app(app_id)?;
    for id in ids {
        state::grant_permission_row(app_id, &id).map_err(|e: DbError| e.to_string())?;
    }
    Ok(())
}

pub fn assert_permissions_granted(app_id: &str, required: &[&str]) -> Result<(), String> {
    let granted = state::list_granted_permissions(app_id).map_err(|e: DbError| e.to_string())?;
    for req in required {
        if !granted.iter().any(|g| g == *req) {
            return Err(format!("Missing app permission: {req}"));
        }
    }
    Ok(())
}

#[allow(dead_code)]
pub fn human_label(permission_id: &str) -> &'static str {
    registry::permission_labels()
        .iter()
        .find(|(id, _)| *id == permission_id)
        .map(|(_, l)| *l)
        .unwrap_or("App capability")
}
