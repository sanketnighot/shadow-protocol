//! Local SQLite storage for wallet onchain data (tokens, NFTs, transactions).

use rusqlite::{Connection, params};
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
  top_assets_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON portfolio_snapshots(timestamp);
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
    let mut guard = DB_PATH.lock().map_err(|_| rusqlite::Error::InvalidParameterName("lock".into()))?;
    *guard = Some(path.to_path_buf());
    Ok(())
}

fn with_connection<F, R>(f: F) -> Result<R, DbError>
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
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    with_connection(|conn| {
        conn.execute(
            "INSERT INTO portfolio_snapshots (timestamp, total_usd, top_assets_json) VALUES (?1, ?2, ?3)",
            params![now, total_usd, top_assets_json],
        )?;
        Ok(())
    })
}

/// Get portfolio snapshots within a range, limited to count.
pub fn get_portfolio_snapshots(limit: u32) -> Result<Vec<PortfolioSnapshot>, DbError> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT timestamp, total_usd, top_assets_json FROM portfolio_snapshots ORDER BY timestamp DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok(PortfolioSnapshot {
                timestamp: row.get(0)?,
                total_usd: row.get(1)?,
                top_assets_json: row.get(2)?,
            })
        })?;

        let mut snapshots = Vec::new();
        for s in rows {
            snapshots.push(s?);
        }
        Ok(snapshots)
    })
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioSnapshot {
    pub timestamp: i64,
    pub total_usd: String,
    pub top_assets_json: String,
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
