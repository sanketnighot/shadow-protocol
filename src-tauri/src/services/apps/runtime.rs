//! Spawn isolated `bun` sidecar (one request per process for crash isolation).

use std::path::PathBuf;
use std::process::Stdio;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

#[derive(Debug, Error)]
pub enum AppsRuntimeError {
    #[error("apps runtime script not found")]
    NotConfigured,
    #[error("spawn failed: {0}")]
    Spawn(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("timed out")]
    Timeout,
    #[error("invalid response")]
    InvalidResponse,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRequest {
    pub op: String,
    pub app_id: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeResponse {
    pub ok: bool,
    #[serde(default)]
    pub error_code: Option<String>,
    #[serde(default)]
    pub error_message: Option<String>,
    #[serde(default)]
    pub data: serde_json::Value,
}

fn script_path(app: &AppHandle) -> Result<PathBuf, AppsRuntimeError> {
    if cfg!(debug_assertions) {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../apps-runtime/src/main.ts");
        if p.exists() {
            return Ok(p);
        }
        return Err(AppsRuntimeError::NotConfigured);
    }
    let dir = app
        .path()
        .resource_dir()
        .map_err(|_| AppsRuntimeError::NotConfigured)?;
    let p = dir.join("apps-runtime/src/main.ts");
    if p.exists() {
        Ok(p)
    } else {
        Err(AppsRuntimeError::NotConfigured)
    }
}

pub async fn invoke_sidecar(
    app: &AppHandle,
    req: RuntimeRequest,
) -> Result<RuntimeResponse, AppsRuntimeError> {
    let script = script_path(app)?;
    let script_str = script.to_str().ok_or(AppsRuntimeError::NotConfigured)?;
    let line = serde_json::to_string(&req).map_err(|_| AppsRuntimeError::InvalidResponse)?;

    let mut child = Command::new("bun")
        .arg(script_str)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| AppsRuntimeError::Spawn(e.to_string()))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppsRuntimeError::Spawn("stdin".into()))?;
    stdin.write_all(line.as_bytes()).await?;
    stdin.write_all(b"\n").await?;
    drop(stdin);

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppsRuntimeError::Spawn("stdout".into()))?;
    let mut reader = BufReader::new(stdout);
    let mut out_line = String::new();
    timeout(Duration::from_secs(45), reader.read_line(&mut out_line))
        .await
        .map_err(|_| AppsRuntimeError::Timeout)??;

    let _ = child.wait().await;

    serde_json::from_str::<RuntimeResponse>(out_line.trim()).map_err(|_| AppsRuntimeError::InvalidResponse)
}

pub async fn ping(app: &AppHandle) -> Result<RuntimeResponse, AppsRuntimeError> {
    invoke_sidecar(
        app,
        RuntimeRequest {
            op: "health.ping".to_string(),
            app_id: "shadow".to_string(),
            payload: serde_json::json!({}),
        },
    )
    .await
}
