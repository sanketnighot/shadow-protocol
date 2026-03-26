//! Local SQLite storage for wallet onchain data (tokens, NFTs, transactions).

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

static DB_PATH: Mutex<Option<std::path::PathBuf>> = Mutex::new(None);

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS wallets (
  address TEXT PRIMARY KEY,
  last_synced_at INTEGER,
  sync_status TEXT DEFAULT 'idle'
);

CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  token_contract TEXT NOT NULL,
  symbol TEXT NOT NULL,
  balance TEXT NOT NULL,
  value_usd TEXT NOT NULL,
  decimals INTEGER NOT NULL,
  asset_type TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS nfts (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  contract TEXT NOT NULL,
  token_id TEXT NOT NULL,
  metadata TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  from_addr TEXT,
  to_addr TEXT,
  value TEXT,
  block_number INTEGER,
  timestamp INTEGER,
  category TEXT,
  metadata TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tokens_wallet ON tokens(wallet_address);
CREATE INDEX IF NOT EXISTS idx_tokens_chain ON tokens(chain);
CREATE INDEX IF NOT EXISTS idx_nfts_wallet ON nfts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_tx_wallet ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions(timestamp);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  total_usd TEXT NOT NULL,
  top_assets_json TEXT NOT NULL,
  wallet_breakdown_json TEXT NOT NULL DEFAULT '[]',
  chain_breakdown_json TEXT NOT NULL DEFAULT '[]',
  net_flow_usd TEXT NOT NULL DEFAULT '0.00',
  performance_usd TEXT NOT NULL DEFAULT '0.00'
);

CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON portfolio_snapshots(timestamp);

CREATE TABLE IF NOT EXISTS target_allocations (
  symbol TEXT PRIMARY KEY,
  percentage REAL NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS active_strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'approval_required',
  trigger_json TEXT NOT NULL,
  action_json TEXT NOT NULL,
  guardrails_json TEXT NOT NULL,
  approval_policy_json TEXT NOT NULL DEFAULT '{}',
  execution_policy_json TEXT NOT NULL DEFAULT '{}',
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_evaluation_at INTEGER,
  disabled_reason TEXT,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS command_log (
  id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  result_message TEXT NOT NULL,
  status TEXT NOT NULL, -- 'approved', 'rejected', 'failed'
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  simulation_json TEXT,
  policy_json TEXT,
  message TEXT NOT NULL,
  expires_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  strategy_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_created_at ON approval_requests(created_at);

CREATE TABLE IF NOT EXISTS tool_executions (
  id TEXT PRIMARY KEY,
  approval_id TEXT,
  strategy_id TEXT,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL,
  request_json TEXT NOT NULL,
  result_json TEXT,
  tx_hash TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tool_executions_status ON tool_executions(status);
CREATE INDEX IF NOT EXISTS idx_tool_executions_created_at ON tool_executions(created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  details_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
"#;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("Database not initialized")]
    NotInitialized,
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

impl serde::Serialize for DbError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Initialize the database at the given path. Creates schema if needed.
pub fn init(path: &Path) -> Result<(), DbError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(SCHEMA)?;
    migrate(&conn)?;
    let mut guard = DB_PATH.lock().map_err(|_| rusqlite::Error::InvalidParameterName("lock".into()))?;
    *guard = Some(path.to_path_buf());
    Ok(())
}

fn migrate(conn: &Connection) -> Result<(), DbError> {
    ensure_column(conn, "portfolio_snapshots", "wallet_breakdown_json", "TEXT NOT NULL DEFAULT '[]'")?;
    ensure_column(conn, "portfolio_snapshots", "chain_breakdown_json", "TEXT NOT NULL DEFAULT '[]'")?;
    ensure_column(conn, "portfolio_snapshots", "net_flow_usd", "TEXT NOT NULL DEFAULT '0.00'")?;
    ensure_column(conn, "portfolio_snapshots", "performance_usd", "TEXT NOT NULL DEFAULT '0.00'")?;

    ensure_column(conn, "active_strategies", "mode", "TEXT NOT NULL DEFAULT 'approval_required'")?;
    ensure_column(conn, "active_strategies", "approval_policy_json", "TEXT NOT NULL DEFAULT '{}'")?;
    ensure_column(conn, "active_strategies", "execution_policy_json", "TEXT NOT NULL DEFAULT '{}'")?;
    ensure_column(conn, "active_strategies", "failure_count", "INTEGER NOT NULL DEFAULT 0")?;
    ensure_column(conn, "active_strategies", "last_evaluation_at", "INTEGER")?;
    ensure_column(conn, "active_strategies", "disabled_reason", "TEXT")?;
    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<(), DbError> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let mut exists = false;
    for col in columns {
        if col? == column {
            exists = true;
            break;
        }
    }
    if !exists {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
            [],
        )?;
    }
    Ok(())
}

pub fn with_connection<F, R>(f: F) -> Result<R, DbError>
where
    F: FnOnce(&Connection) -> Result<R, rusqlite::Error>,
{
    let path = DB_PATH
        .lock()
        .map_err(|_| DbError::NotInitialized)?
        .clone();
    let path = path.ok_or(DbError::NotInitialized)?;
    let conn = Connection::open(&path)?;
    f(&conn).map_err(DbError::Sqlite)
}

/// Set wallet sync status.
pub fn set_wallet_sync_status(
    address: &str,
    status: &str,
    last_synced_at: Option<i64>,
) -> Result<(), DbError> {
    with_connection(|conn| {
        conn.execute(
            r#"
            INSERT INTO wallets (address, last_synced_at, sync_status)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(address) DO UPDATE SET
              last_synced_at = excluded.last_synced_at,
              sync_status = excluded.sync_status
            "#,
            params![address, last_synced_at, status],
        )?;
        Ok(())
    })
}

/// Get last sync timestamp for a wallet. Returns None if never synced.
pub fn get_wallet_last_synced(address: &str) -> Result<Option<i64>, DbError> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT last_synced_at FROM wallets WHERE address = ?1",
        )?;
        let mut rows = stmt.query(params![address])?;
        if let Some(row) = rows.next()? {
            let ts: Option<i64> = row.get(0)?;
            Ok(ts)
        } else {
            Ok(None)
        }
    })
}

/// Insert a new portfolio snapshot.
pub fn insert_portfolio_snapshot(
    total_usd: &str,
    top_assets_json: &str,
) -> Result<(), DbError> {
    insert_portfolio_snapshot_full(total_usd, top_assets_json, "[]", "[]", "0.00", "0.00")
}

pub fn insert_portfolio_snapshot_full(
    total_usd: &str,
    top_assets_json: &str,
    wallet_breakdown_json: &str,
    chain_breakdown_json: &str,
    net_flow_usd: &str,
    performance_usd: &str,
) -> Result<(), DbError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    with_connection(|conn| {
        conn.execute(
            "INSERT INTO portfolio_snapshots (timestamp, total_usd, top_assets_json, wallet_breakdown_json, chain_breakdown_json, net_flow_usd, performance_usd) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![now, total_usd, top_assets_json, wallet_breakdown_json, chain_breakdown_json, net_flow_usd, performance_usd],
        )?;
        Ok(())
    })
}

/// Get portfolio snapshots within a range, limited to count.
pub fn get_portfolio_snapshots(limit: u32) -> Result<Vec<PortfolioSnapshot>, DbError> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT timestamp, total_usd, top_assets_json, wallet_breakdown_json, chain_breakdown_json, net_flow_usd, performance_usd FROM portfolio_snapshots ORDER BY timestamp DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(PortfolioSnapshot {
                timestamp: row.get(0)?,
                total_usd: row.get(1)?,
                top_assets_json: row.get(2)?,
                wallet_breakdown_json: row.get(3)?,
                chain_breakdown_json: row.get(4)?,
                net_flow_usd: row.get(5)?,
                performance_usd: row.get(6)?,
            })
        })?;

        let mut snapshots = Vec::new();
        for s in rows {
            snapshots.push(s?);
        }
        Ok(snapshots)
    })
}

/// Truncates all tables in the database.
pub fn clear_all_data() -> Result<(), DbError> {
    with_connection(|conn| {
        conn.execute("DELETE FROM tokens", [])?;
        conn.execute("DELETE FROM nfts", [])?;
        conn.execute("DELETE FROM transactions", [])?;
        conn.execute("DELETE FROM wallets", [])?;
        conn.execute("DELETE FROM portfolio_snapshots", [])?;
        conn.execute("DELETE FROM target_allocations", [])?;
        conn.execute("DELETE FROM active_strategies", [])?;
        conn.execute("DELETE FROM approval_requests", [])?;
        conn.execute("DELETE FROM tool_executions", [])?;
        conn.execute("DELETE FROM audit_log", [])?;
        Ok(())
    })
}

/// Set target allocations (replaces existing list).
#[allow(dead_code)]
pub fn set_target_allocations(allocations: Vec<TargetAllocation>) -> Result<(), DbError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    with_connection(|conn| {
        conn.execute("DELETE FROM target_allocations", [])?;
        for a in allocations {
            conn.execute(
                "INSERT INTO target_allocations (symbol, percentage, updated_at) VALUES (?1, ?2, ?3)",
                params![a.symbol, a.percentage, now],
            )?;
        }
        Ok(())
    })
}

/// Get target allocations.
pub fn get_target_allocations() -> Result<Vec<TargetAllocation>, DbError> {
    with_connection(|conn| {
        let mut stmt = conn.prepare("SELECT symbol, percentage FROM target_allocations")?;
        let rows = stmt.query_map([], |row| {
            Ok(TargetAllocation {
                symbol: row.get(0)?,
                percentage: row.get(1)?,
            })
        })?;

        let mut all = Vec::new();
        for r in rows {
            all.push(r?);
        }
        Ok(all)
    })
}

/// Upsert active strategy.
#[allow(dead_code)]
pub fn upsert_strategy(strategy: &ActiveStrategy) -> Result<(), DbError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    with_connection(|conn| {
        conn.execute(
            r#"
            INSERT INTO active_strategies (id, name, summary, status, mode, trigger_json, action_json, guardrails_json, approval_policy_json, execution_policy_json, failure_count, last_evaluation_at, disabled_reason, last_run_at, next_run_at, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              summary = excluded.summary,
              status = excluded.status,
              mode = excluded.mode,
              trigger_json = excluded.trigger_json,
              action_json = excluded.action_json,
              guardrails_json = excluded.guardrails_json,
              approval_policy_json = excluded.approval_policy_json,
              execution_policy_json = excluded.execution_policy_json,
              failure_count = excluded.failure_count,
              last_evaluation_at = excluded.last_evaluation_at,
              disabled_reason = excluded.disabled_reason,
              last_run_at = excluded.last_run_at,
              next_run_at = excluded.next_run_at
            "#,
            params![
                strategy.id,
                strategy.name,
                strategy.summary,
                strategy.status,
                strategy.mode,
                strategy.trigger_json,
                strategy.action_json,
                strategy.guardrails_json,
                strategy.approval_policy_json,
                strategy.execution_policy_json,
                strategy.failure_count,
                strategy.last_evaluation_at,
                strategy.disabled_reason,
                strategy.last_run_at,
                strategy.next_run_at,
                now,
            ],
        )?;
        Ok(())
    })
}

/// Get all active strategies.
#[allow(dead_code)]
pub fn get_strategies() -> Result<Vec<ActiveStrategy>, DbError> {
    with_connection(|conn| {
        let mut stmt = conn.prepare("SELECT id, name, summary, status, mode, trigger_json, action_json, guardrails_json, approval_policy_json, execution_policy_json, failure_count, last_evaluation_at, disabled_reason, last_run_at, next_run_at FROM active_strategies")?;
        let rows = stmt.query_map([], |row| {
            Ok(ActiveStrategy {
                id: row.get(0)?,
                name: row.get(1)?,
                summary: row.get(2)?,
                status: row.get(3)?,
                mode: row.get(4)?,
                trigger_json: row.get(5)?,
                action_json: row.get(6)?,
                guardrails_json: row.get(7)?,
                approval_policy_json: row.get(8)?,
                execution_policy_json: row.get(9)?,
                failure_count: row.get(10)?,
                last_evaluation_at: row.get(11)?,
                disabled_reason: row.get(12)?,
                last_run_at: row.get(13)?,
                next_run_at: row.get(14)?,
            })
        })?;

        let mut all = Vec::new();
        for r in rows {
            all.push(r?);
        }
        Ok(all)
    })
}

pub fn get_due_strategies(now: i64) -> Result<Vec<ActiveStrategy>, DbError> {
    let all = get_strategies()?;
    Ok(all
        .into_iter()
        .filter(|s| {
            s.status == "active"
                && s.disabled_reason.is_none()
                && s.next_run_at.map(|next| next <= now).unwrap_or(true)
        })
        .collect())
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandLogEntry {
    pub id: String,
    pub tool_name: String,
    pub payload_json: String,
    pub result_message: String,
    pub status: String,
    pub created_at: i64,
}

pub fn insert_command_log(entry: &CommandLogEntry) -> Result<(), DbError> {
    with_connection(|conn| {
        conn.execute(
            "INSERT INTO command_log (id, tool_name, payload_json, result_message, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                entry.id,
                entry.tool_name,
                entry.payload_json,
                entry.result_message,
                entry.status,
                entry.created_at,
            ],
        )?;
        Ok(())
    })
}

pub fn get_command_log(limit: u32) -> Result<Vec<CommandLogEntry>, DbError> {
    with_connection(|conn| {
        let mut stmt = conn.prepare("SELECT id, tool_name, payload_json, result_message, status, created_at FROM command_log ORDER BY created_at DESC LIMIT ?1")?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(CommandLogEntry {
                id: row.get(0)?,
                tool_name: row.get(1)?,
                payload_json: row.get(2)?,
                result_message: row.get(3)?,
                status: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;

        let mut all = Vec::new();
        for r in rows {
            all.push(r?);
        }
        Ok(all)
    })
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct TargetAllocation {
    pub symbol: String,
    pub percentage: f64,
}

#[allow(dead_code)]
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveStrategy {
    pub id: String,
    pub name: String,
    pub summary: Option<String>,
    pub status: String,
    pub mode: String,
    pub trigger_json: String,
    pub action_json: String,
    pub guardrails_json: String,
    pub approval_policy_json: String,
    pub execution_policy_json: String,
    pub failure_count: i64,
    pub last_evaluation_at: Option<i64>,
    pub disabled_reason: Option<String>,
    pub last_run_at: Option<i64>,
    pub next_run_at: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioSnapshot {
    pub timestamp: i64,
    pub total_usd: String,
    pub top_assets_json: String,
    pub wallet_breakdown_json: String,
    pub chain_breakdown_json: String,
    pub net_flow_usd: String,
    pub performance_usd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRecord {
    pub id: String,
    pub source: String,
    pub tool_name: String,
    pub kind: String,
    pub status: String,
    pub payload_json: String,
    pub simulation_json: Option<String>,
    pub policy_json: Option<String>,
    pub message: String,
    pub expires_at: Option<i64>,
    pub version: i64,
    pub strategy_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolExecutionRecord {
    pub id: String,
    pub approval_id: Option<String>,
    pub strategy_id: Option<String>,
    pub tool_name: String,
    pub status: String,
    pub request_json: String,
    pub result_json: Option<String>,
    pub tx_hash: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub id: String,
    pub event_type: String,
    pub subject_type: String,
    pub subject_id: Option<String>,
    pub details_json: String,
    pub created_at: i64,
}

pub fn insert_approval_request(record: &ApprovalRecord) -> Result<(), DbError> {
    with_connection(|conn| {
        conn.execute(
            "INSERT INTO approval_requests (id, source, tool_name, kind, status, payload_json, simulation_json, policy_json, message, expires_at, version, strategy_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                record.id,
                record.source,
                record.tool_name,
                record.kind,
                record.status,
                record.payload_json,
                record.simulation_json,
                record.policy_json,
                record.message,
                record.expires_at,
                record.version,
                record.strategy_id,
                record.created_at,
                record.updated_at,
            ],
        )?;
        Ok(())
    })
}

pub fn get_pending_approvals() -> Result<Vec<ApprovalRecord>, DbError> {
    with_connection(|conn| {
        let mut stmt = conn.prepare("SELECT id, source, tool_name, kind, status, payload_json, simulation_json, policy_json, message, expires_at, version, strategy_id, created_at, updated_at FROM approval_requests WHERE status = 'pending' ORDER BY created_at DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(ApprovalRecord {
                id: row.get(0)?,
                source: row.get(1)?,
                tool_name: row.get(2)?,
                kind: row.get(3)?,
                status: row.get(4)?,
                payload_json: row.get(5)?,
                simulation_json: row.get(6)?,
                policy_json: row.get(7)?,
                message: row.get(8)?,
                expires_at: row.get(9)?,
                version: row.get(10)?,
                strategy_id: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })?;
        let mut all = Vec::new();
        for row in rows {
            all.push(row?);
        }
        Ok(all)
    })
}

pub fn get_approval_request(id: &str) -> Result<Option<ApprovalRecord>, DbError> {
    with_connection(|conn| {
        let mut stmt = conn.prepare("SELECT id, source, tool_name, kind, status, payload_json, simulation_json, policy_json, message, expires_at, version, strategy_id, created_at, updated_at FROM approval_requests WHERE id = ?1 LIMIT 1")?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(ApprovalRecord {
                id: row.get(0)?,
                source: row.get(1)?,
                tool_name: row.get(2)?,
                kind: row.get(3)?,
                status: row.get(4)?,
                payload_json: row.get(5)?,
                simulation_json: row.get(6)?,
                policy_json: row.get(7)?,
                message: row.get(8)?,
                expires_at: row.get(9)?,
                version: row.get(10)?,
                strategy_id: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            }))
        } else {
            Ok(None)
        }
    })
}

pub fn update_approval_request_status(id: &str, status: &str, expected_version: i64) -> Result<bool, DbError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    with_connection(|conn| {
        let changed = conn.execute(
            "UPDATE approval_requests SET status = ?2, version = version + 1, updated_at = ?3 WHERE id = ?1 AND version = ?4 AND status = 'pending'",
            params![id, status, now, expected_version],
        )?;
        Ok(changed > 0)
    })
}

pub fn expire_stale_approvals(now: i64) -> Result<(), DbError> {
    with_connection(|conn| {
        conn.execute(
            "UPDATE approval_requests SET status = 'expired', version = version + 1, updated_at = ?1 WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < ?1",
            params![now],
        )?;
        Ok(())
    })
}

pub fn insert_tool_execution(record: &ToolExecutionRecord) -> Result<(), DbError> {
    with_connection(|conn| {
        conn.execute(
            "INSERT INTO tool_executions (id, approval_id, strategy_id, tool_name, status, request_json, result_json, tx_hash, error_code, error_message, created_at, completed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                record.id,
                record.approval_id,
                record.strategy_id,
                record.tool_name,
                record.status,
                record.request_json,
                record.result_json,
                record.tx_hash,
                record.error_code,
                record.error_message,
                record.created_at,
                record.completed_at,
            ],
        )?;
        Ok(())
    })
}

pub fn update_tool_execution(record: &ToolExecutionRecord) -> Result<(), DbError> {
    with_connection(|conn| {
        conn.execute(
            "UPDATE tool_executions SET status = ?2, result_json = ?3, tx_hash = ?4, error_code = ?5, error_message = ?6, completed_at = ?7 WHERE id = ?1",
            params![
                record.id,
                record.status,
                record.result_json,
                record.tx_hash,
                record.error_code,
                record.error_message,
                record.completed_at,
            ],
        )?;
        Ok(())
    })
}

pub fn get_tool_executions(limit: u32) -> Result<Vec<ToolExecutionRecord>, DbError> {
    with_connection(|conn| {
        let mut stmt = conn.prepare("SELECT id, approval_id, strategy_id, tool_name, status, request_json, result_json, tx_hash, error_code, error_message, created_at, completed_at FROM tool_executions ORDER BY created_at DESC LIMIT ?1")?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(ToolExecutionRecord {
                id: row.get(0)?,
                approval_id: row.get(1)?,
                strategy_id: row.get(2)?,
                tool_name: row.get(3)?,
                status: row.get(4)?,
                request_json: row.get(5)?,
                result_json: row.get(6)?,
                tx_hash: row.get(7)?,
                error_code: row.get(8)?,
                error_message: row.get(9)?,
                created_at: row.get(10)?,
                completed_at: row.get(11)?,
            })
        })?;
        let mut all = Vec::new();
        for row in rows {
            all.push(row?);
        }
        Ok(all)
    })
}

pub fn insert_audit_log(entry: &AuditLogEntry) -> Result<(), DbError> {
    with_connection(|conn| {
        conn.execute(
            "INSERT INTO audit_log (id, event_type, subject_type, subject_id, details_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                entry.id,
                entry.event_type,
                entry.subject_type,
                entry.subject_id,
                entry.details_json,
                entry.created_at,
            ],
        )?;
        Ok(())
    })
}

/// Upsert tokens for a wallet. Replaces all tokens for this wallet on the given chain.
pub fn upsert_tokens(
    wallet_address: &str,
    chain: &str,
    tokens: &[TokenRow],
) -> Result<(), DbError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    with_connection(|conn| {
        conn.execute(
            "DELETE FROM tokens WHERE wallet_address = ?1 AND chain = ?2",
            params![wallet_address, chain],
        )?;
        for t in tokens {
            conn.execute(
                r#"
                INSERT INTO tokens (id, wallet_address, chain, token_contract, symbol, balance, value_usd, decimals, asset_type, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                "#,
                params![
                    t.id,
                    wallet_address,
                    chain,
                    t.token_contract,
                    t.symbol,
                    t.balance,
                    t.value_usd,
                    t.decimals,
                    t.asset_type,
                    now,
                ],
            )?;
        }
        Ok(())
    })
}

/// Upsert NFTs for a wallet.
pub fn upsert_nfts(
    wallet_address: &str,
    chain: &str,
    nfts: &[NftRow],
) -> Result<(), DbError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    with_connection(|conn| {
        conn.execute(
            "DELETE FROM nfts WHERE wallet_address = ?1 AND chain = ?2",
            params![wallet_address, chain],
        )?;
        for n in nfts {
            conn.execute(
                r#"
                INSERT INTO nfts (id, wallet_address, chain, contract, token_id, metadata, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
                params![
                    n.id,
                    wallet_address,
                    chain,
                    n.contract,
                    n.token_id,
                    n.metadata,
                    now,
                ],
            )?;
        }
        Ok(())
    })
}

/// Upsert transactions. Uses tx_hash as id; replaces if exists.
pub fn upsert_transactions(
    wallet_address: &str,
    chain: &str,
    txs: &[TransactionRow],
) -> Result<(), DbError> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    with_connection(|conn| {
        for t in txs {
            conn.execute(
                r#"
                INSERT INTO transactions (id, wallet_address, chain, tx_hash, from_addr, to_addr, value, block_number, timestamp, category, metadata, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                ON CONFLICT(id) DO UPDATE SET
                  from_addr = excluded.from_addr,
                  to_addr = excluded.to_addr,
                  value = excluded.value,
                  block_number = excluded.block_number,
                  timestamp = excluded.timestamp,
                  category = excluded.category,
                  metadata = excluded.metadata,
                  updated_at = excluded.updated_at
                "#,
                params![
                    t.id,
                    wallet_address,
                    chain,
                    t.tx_hash,
                    t.from_addr,
                    t.to_addr,
                    t.value,
                    t.block_number,
                    t.timestamp,
                    t.category,
                    t.metadata,
                    now,
                ],
            )?;
        }
        Ok(())
    })
}

/// Fetch transactions for given wallet addresses, ordered by timestamp DESC.
pub fn get_transactions_for_wallets(
    addresses: &[String],
    limit: Option<i64>,
) -> Result<Vec<TransactionRow>, DbError> {
    let limit = limit.unwrap_or(100);
    let mut all = Vec::new();
    for addr in addresses {
        let rows = with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, tx_hash, chain, from_addr, to_addr, value, block_number, timestamp, category, metadata
                 FROM transactions
                 WHERE wallet_address = ?1
                 ORDER BY COALESCE(timestamp, 0) DESC
                 LIMIT ?2",
            )?;
            let mut rows = stmt.query(params![addr, limit])?;
            let mut out = Vec::new();
            while let Some(row) = rows.next()? {
                out.push(TransactionRow {
                    id: row.get(0)?,
                    tx_hash: row.get(1)?,
                    chain: row.get(2)?,
                    from_addr: row.get(3)?,
                    to_addr: row.get(4)?,
                    value: row.get(5)?,
                    block_number: row.get(6)?,
                    timestamp: row.get(7)?,
                    category: row.get(8)?,
                    metadata: row.get(9)?,
                });
            }
            Ok(out)
        })?;
        all.extend(rows);
    }
    all.sort_by(|a, b| {
        let ta = a.timestamp.unwrap_or(0);
        let tb = b.timestamp.unwrap_or(0);
        tb.cmp(&ta)
    });
    all.truncate(limit as usize);
    Ok(all)
}

/// Full NFT row including wallet and chain (for query results).
#[derive(Debug, Clone)]
pub struct NftRowFull {
    pub id: String,
    pub chain: String,
    pub contract: String,
    pub token_id: String,
    pub metadata: Option<String>,
}

/// Fetch NFTs for given wallet addresses.
pub fn get_nfts_for_wallets(addresses: &[String]) -> Result<Vec<NftRowFull>, DbError> {
    let mut all = Vec::new();
    for addr in addresses {
        let rows = with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, chain, contract, token_id, metadata
                 FROM nfts
                 WHERE wallet_address = ?1",
            )?;
            let mut rows = stmt.query(params![addr])?;
            let mut out = Vec::new();
            while let Some(row) = rows.next()? {
                out.push(NftRowFull {
                    id: row.get(0)?,
                    chain: row.get(1)?,
                    contract: row.get(2)?,
                    token_id: row.get(3)?,
                    metadata: row.get(4)?,
                });
            }
            Ok(out)
        })?;
        all.extend(rows);
    }
    Ok(all)
}

/// Fetch all tokens for given wallet addresses. Used by portfolio commands.
pub fn get_tokens_for_wallets(addresses: &[String]) -> Result<Vec<TokenRow>, DbError> {
    let mut all = Vec::new();
    for addr in addresses {
        let rows = with_connection(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, wallet_address, chain, token_contract, symbol, balance, value_usd, decimals, asset_type FROM tokens WHERE wallet_address = ?1",
            )?;
            let mut rows = stmt.query(params![addr])?;
            let mut out = Vec::new();
            while let Some(row) = rows.next()? {
                out.push(TokenRow {
                    id: row.get(0)?,
                    wallet_address: row.get(1)?,
                    chain: row.get(2)?,
                    token_contract: row.get(3)?,
                    symbol: row.get(4)?,
                    balance: row.get(5)?,
                    value_usd: row.get(6)?,
                    decimals: row.get(7)?,
                    asset_type: row.get(8)?,
                });
            }
            Ok(out)
        })?;
        all.extend(rows);
    }
    Ok(all)
}

#[derive(Debug, Clone)]
pub struct TokenRow {
    pub id: String,
    pub wallet_address: String,
    pub chain: String,
    pub token_contract: String,
    pub symbol: String,
    pub balance: String,
    pub value_usd: String,
    pub decimals: u8,
    pub asset_type: String,
}

#[derive(Debug, Clone)]
pub struct NftRow {
    pub id: String,
    pub contract: String,
    pub token_id: String,
    pub metadata: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TransactionRow {
    pub id: String,
    pub tx_hash: String,
    pub chain: String,
    pub from_addr: Option<String>,
    pub to_addr: Option<String>,
    pub value: Option<String>,
    pub block_number: Option<i64>,
    pub timestamp: Option<i64>,
    pub category: Option<String>,
    pub metadata: Option<String>,
}
