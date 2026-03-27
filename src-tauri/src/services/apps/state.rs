//! SQLite persistence for apps catalog, installs, configs, backups, scheduler.

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::services::local_db::{self, DbError};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppCatalogRow {
    pub id: String,
    pub name: String,
    pub short_description: String,
    pub long_description: String,
    pub icon_key: String,
    pub version: String,
    pub author: String,
    pub features_json: String,
    pub permissions_json: String,
    pub secret_requirements_json: String,
    pub agent_tools_json: String,
    pub network_scopes_json: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAppRow {
    pub app_id: String,
    pub lifecycle: String,
    pub installed_version: String,
    pub enabled: bool,
    pub health_status: String,
    pub health_message: Option<String>,
    pub last_health_at: Option<i64>,
    pub permissions_acknowledged_at: Option<i64>,
    pub error_message: Option<String>,
    pub installed_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppMarketplaceEntry {
    /// Nested for JSON/Tauri IPC; do not `flatten` or the frontend loses `catalog`.
    pub catalog: AppCatalogRow,
    pub installed: Option<InstalledAppRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppBackupRow {
    pub id: String,
    pub app_id: String,
    pub cid: String,
    pub encryption_version: i64,
    pub created_at: i64,
    pub scope_json: String,
    pub status: String,
    pub size_bytes: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSchedulerJobRow {
    pub id: String,
    pub app_id: String,
    pub kind: String,
    pub payload_json: String,
    pub interval_secs: i64,
    pub next_run_at: i64,
    pub enabled: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn list_marketplace() -> Result<Vec<AppMarketplaceEntry>, DbError> {
    local_db::with_connection(|conn| {
        let mut stmt = conn.prepare(
            r#"SELECT c.id, c.name, c.short_description, c.long_description, c.icon_key, c.version, c.author,
                      c.features_json, c.permissions_json, c.secret_requirements_json, c.agent_tools_json, c.network_scopes_json, c.updated_at,
                      i.app_id, i.lifecycle, i.installed_version, i.enabled, i.health_status, i.health_message, i.last_health_at,
                      i.permissions_acknowledged_at, i.error_message, i.installed_at, i.updated_at
               FROM apps_catalog c
               LEFT JOIN installed_apps i ON i.app_id = c.id
               ORDER BY c.name ASC"#,
        )?;
        let rows = stmt.query_map([], |row| {
            let catalog = AppCatalogRow {
                id: row.get(0)?,
                name: row.get(1)?,
                short_description: row.get(2)?,
                long_description: row.get(3)?,
                icon_key: row.get(4)?,
                version: row.get(5)?,
                author: row.get(6)?,
                features_json: row.get(7)?,
                permissions_json: row.get(8)?,
                secret_requirements_json: row.get(9)?,
                agent_tools_json: row.get(10)?,
                network_scopes_json: row.get(11)?,
                updated_at: row.get(12)?,
            };
            let installed = if row.get::<_, Option<String>>(13)?.is_some() {
                Some(InstalledAppRow {
                    app_id: row.get(13)?,
                    lifecycle: row.get(14)?,
                    installed_version: row.get(15)?,
                    enabled: row.get::<_, i64>(16)? != 0,
                    health_status: row.get(17)?,
                    health_message: row.get(18)?,
                    last_health_at: row.get(19)?,
                    permissions_acknowledged_at: row.get(20)?,
                    error_message: row.get(21)?,
                    installed_at: row.get(22)?,
                    updated_at: row.get(23)?,
                })
            } else {
                None
            };
            Ok(AppMarketplaceEntry { catalog, installed })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    })
}

pub fn get_installed(app_id: &str) -> Result<Option<InstalledAppRow>, DbError> {
    local_db::with_connection(|conn| {
        let mut stmt = conn.prepare(
            r#"SELECT app_id, lifecycle, installed_version, enabled, health_status, health_message, last_health_at,
                      permissions_acknowledged_at, error_message, installed_at, updated_at
               FROM installed_apps WHERE app_id = ?1"#,
        )?;
        let mut rows = stmt.query(params![app_id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(InstalledAppRow {
                app_id: row.get(0)?,
                lifecycle: row.get(1)?,
                installed_version: row.get(2)?,
                enabled: row.get::<_, i64>(3)? != 0,
                health_status: row.get(4)?,
                health_message: row.get(5)?,
                last_health_at: row.get(6)?,
                permissions_acknowledged_at: row.get(7)?,
                error_message: row.get(8)?,
                installed_at: row.get(9)?,
                updated_at: row.get(10)?,
            }))
        } else {
            Ok(None)
        }
    })
}

/// App is installed, enabled, in active lifecycle, and not in error state for gating.
pub fn is_tool_app_ready(app_id: &str) -> Result<bool, DbError> {
    Ok(match get_installed(app_id)? {
        Some(row) => {
            row.enabled
                && row.lifecycle == "active"
                && row.health_status != "error"
                && row.permissions_acknowledged_at.is_some()
        }
        None => false,
    })
}

pub fn upsert_installed_app(
    app_id: &str,
    lifecycle: &str,
    installed_version: &str,
    enabled: bool,
) -> Result<(), DbError> {
    let t = now();
    local_db::with_connection(|conn| {
        conn.execute(
            r#"INSERT INTO installed_apps (
                app_id, lifecycle, installed_version, enabled, health_status, installed_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, 'unknown', ?5, ?6)
            ON CONFLICT(app_id) DO UPDATE SET
                lifecycle = excluded.lifecycle,
                installed_version = excluded.installed_version,
                enabled = excluded.enabled,
                updated_at = excluded.updated_at,
                error_message = NULL"#,
            params![
                app_id,
                lifecycle,
                installed_version,
                if enabled { 1_i64 } else { 0_i64 },
                t,
                t
            ],
        )?;
        Ok(())
    })
}

pub fn set_installed_enabled(app_id: &str, enabled: bool) -> Result<(), DbError> {
    let t = now();
    local_db::with_connection(|conn| {
        conn.execute(
            "UPDATE installed_apps SET enabled = ?2, lifecycle = CASE WHEN ?2 = 1 THEN 'active' ELSE 'installed_disabled' END, updated_at = ?3 WHERE app_id = ?1",
            params![app_id, if enabled { 1_i64 } else { 0_i64 }, t],
        )?;
        Ok(())
    })
}

pub fn set_health(
    app_id: &str,
    health_status: &str,
    health_message: Option<&str>,
) -> Result<(), DbError> {
    let t = now();
    local_db::with_connection(|conn| {
        conn.execute(
            "UPDATE installed_apps SET health_status = ?2, health_message = ?3, last_health_at = ?4, updated_at = ?4 WHERE app_id = ?1",
            params![app_id, health_status, health_message, t],
        )?;
        Ok(())
    })
}

pub fn acknowledge_permissions(app_id: &str) -> Result<(), DbError> {
    let t = now();
    local_db::with_connection(|conn| {
        conn.execute(
            "UPDATE installed_apps SET permissions_acknowledged_at = ?2, lifecycle = 'active', updated_at = ?2 WHERE app_id = ?1",
            params![app_id, t],
        )?;
        Ok(())
    })
}

pub fn delete_installed_app(app_id: &str) -> Result<(), DbError> {
    local_db::with_connection(|conn| {
        conn.execute("DELETE FROM app_permissions WHERE app_id = ?1", params![app_id])?;
        conn.execute("DELETE FROM app_configs WHERE app_id = ?1", params![app_id])?;
        conn.execute("DELETE FROM app_backups WHERE app_id = ?1", params![app_id])?;
        conn.execute(
            "DELETE FROM app_scheduler_jobs WHERE app_id = ?1",
            params![app_id],
        )?;
        conn.execute("DELETE FROM installed_apps WHERE app_id = ?1", params![app_id])?;
        Ok(())
    })
}

pub fn grant_permission_row(app_id: &str, permission_id: &str) -> Result<(), DbError> {
    let t = now();
    local_db::with_connection(|conn| {
        conn.execute(
            "INSERT INTO app_permissions (app_id, permission_id, granted_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(app_id, permission_id) DO UPDATE SET granted_at = excluded.granted_at",
            params![app_id, permission_id, t],
        )?;
        Ok(())
    })
}

pub fn list_granted_permissions(app_id: &str) -> Result<Vec<String>, DbError> {
    local_db::with_connection(|conn| {
        let mut stmt =
            conn.prepare("SELECT permission_id FROM app_permissions WHERE app_id = ?1")?;
        let rows = stmt.query_map(params![app_id], |row| row.get(0))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    })
}

pub fn get_app_config_json(app_id: &str) -> Result<String, DbError> {
    local_db::with_connection(|conn| {
        let mut stmt = conn.prepare("SELECT config_json FROM app_configs WHERE app_id = ?1")?;
        let mut rows = stmt.query(params![app_id])?;
        if let Some(row) = rows.next()? {
            Ok(row.get::<_, String>(0)?)
        } else {
            Ok("{}".to_string())
        }
    })
}

pub fn set_app_config_json(app_id: &str, config_json: &str) -> Result<(), DbError> {
    let t = now();
    local_db::with_connection(|conn| {
        conn.execute(
            r#"INSERT INTO app_configs (app_id, config_json, updated_at) VALUES (?1, ?2, ?3)
               ON CONFLICT(app_id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at"#,
            params![app_id, config_json, t],
        )?;
        Ok(())
    })
}

pub fn insert_app_backup(row: &AppBackupRow) -> Result<(), DbError> {
    local_db::with_connection(|conn| {
        conn.execute(
            r#"INSERT INTO app_backups (id, app_id, cid, encryption_version, created_at, scope_json, status, size_bytes, notes)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
            params![
                row.id,
                row.app_id,
                row.cid,
                row.encryption_version,
                row.created_at,
                row.scope_json,
                row.status,
                row.size_bytes,
                row.notes,
            ],
        )?;
        Ok(())
    })
}

pub fn list_app_backups(app_id: &str, limit: u32) -> Result<Vec<AppBackupRow>, DbError> {
    local_db::with_connection(|conn| {
        let mut stmt = conn.prepare(
            r#"SELECT id, app_id, cid, encryption_version, created_at, scope_json, status, size_bytes, notes
               FROM app_backups WHERE app_id = ?1 ORDER BY created_at DESC LIMIT ?2"#,
        )?;
        let rows = stmt.query_map(params![app_id, limit], |row| {
            Ok(AppBackupRow {
                id: row.get(0)?,
                app_id: row.get(1)?,
                cid: row.get(2)?,
                encryption_version: row.get(3)?,
                created_at: row.get(4)?,
                scope_json: row.get(5)?,
                status: row.get(6)?,
                size_bytes: row.get(7)?,
                notes: row.get(8)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    })
}

pub fn upsert_scheduler_job(row: &AppSchedulerJobRow) -> Result<(), DbError> {
    local_db::with_connection(|conn| {
        conn.execute(
            r#"INSERT INTO app_scheduler_jobs (id, app_id, kind, payload_json, interval_secs, next_run_at, enabled, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
               ON CONFLICT(id) DO UPDATE SET
                 payload_json = excluded.payload_json,
                 interval_secs = excluded.interval_secs,
                 next_run_at = excluded.next_run_at,
                 enabled = excluded.enabled,
                 updated_at = excluded.updated_at"#,
            params![
                row.id,
                row.app_id,
                row.kind,
                row.payload_json,
                row.interval_secs,
                row.next_run_at,
                if row.enabled { 1_i64 } else { 0_i64 },
                row.created_at,
                row.updated_at,
            ],
        )?;
        Ok(())
    })
}

pub fn list_due_scheduler_jobs(now: i64) -> Result<Vec<AppSchedulerJobRow>, DbError> {
    local_db::with_connection(|conn| {
        let mut stmt = conn.prepare(
            r#"SELECT id, app_id, kind, payload_json, interval_secs, next_run_at, enabled, created_at, updated_at
               FROM app_scheduler_jobs WHERE enabled = 1 AND next_run_at <= ?1 ORDER BY next_run_at ASC"#,
        )?;
        let rows = stmt.query_map(params![now], |row| {
            Ok(AppSchedulerJobRow {
                id: row.get(0)?,
                app_id: row.get(1)?,
                kind: row.get(2)?,
                payload_json: row.get(3)?,
                interval_secs: row.get(4)?,
                next_run_at: row.get(5)?,
                enabled: row.get::<_, i64>(6)? != 0,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    })
}

pub fn record_scheduler_job_run(id: &str, next_run_at: i64) -> Result<(), DbError> {
    let t = now();
    local_db::with_connection(|conn| {
        conn.execute(
            "UPDATE app_scheduler_jobs SET next_run_at = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, next_run_at, t],
        )?;
        Ok(())
    })
}

#[allow(dead_code)]
pub fn delete_scheduler_job(id: &str) -> Result<(), DbError> {
    local_db::with_connection(|conn| {
        conn.execute("DELETE FROM app_scheduler_jobs WHERE id = ?1", params![id])?;
        Ok(())
    })
}

pub fn catalog_has_id(app_id: &str) -> Result<bool, DbError> {
    local_db::with_connection(|conn| {
        let mut stmt = conn.prepare("SELECT 1 FROM apps_catalog WHERE id = ?1 LIMIT 1")?;
        let mut rows = stmt.query(params![app_id])?;
        Ok(rows.next()?.is_some())
    })
}
