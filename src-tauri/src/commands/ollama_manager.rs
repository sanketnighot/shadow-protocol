//! Ollama manager: status check, install, start service, pull models.
//! macOS-only for initial implementation.

use serde::{Deserialize, Serialize};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::time::sleep;

const OLLAMA_INSTALL_URL: &str = "https://ollama.com/install.sh";
const OLLAMA_INSTALL_PATH: &str = "/tmp/ollama-install.sh";
const OLLAMA_HOST: &str = "http://localhost:11434";
const OLLAMA_LIST_HEADER: &str = "NAME";

/// Strip ANSI escape sequences (e.g. from `ollama rm` stderr).
fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.next() == Some('[') {
                for c in chars.by_ref() {
                    if c.is_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            result.push(c);
        }
    }
    result.replace('\r', "").trim().to_string()
}

fn run_shell(cmd: &str, args: &[&str]) -> Result<(bool, String, String), String> {
    let output = Command::new(cmd)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run {}: {}", cmd, e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Ok((output.status.success(), stdout, stderr))
}

fn emit_progress(app: &AppHandle, step: &str, progress: u8) {
    let _ = app.emit("ollama_progress", (step.to_string(), progress));
}

fn parse_ollama_list(stdout: &str) -> Vec<String> {
    let mut models = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with(OLLAMA_LIST_HEADER) {
            continue;
        }
        if let Some(first) = line.split_whitespace().next() {
            if !first.is_empty() {
                models.push(first.to_string());
            }
        }
    }
    models
}

fn parse_pull_progress(line: &str) -> Option<u8> {
    // e.g. "pulling manifest... 100%" or "pulling abc123... 45%"
    if let Some(pct) = line.split('%').next().and_then(|s| s.split_whitespace().last()) {
        if let Ok(n) = pct.parse::<u8>() {
            return Some(n.min(100));
        }
    }
    // e.g. "xxx MB / yyy MB" - approximate
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() >= 4 {
        if let (Ok(a), Ok(b)) = (parts[0].parse::<f64>(), parts[3].parse::<f64>()) {
            if b > 0.0 {
                return Some((a / b * 100.0) as u8);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{parse_ollama_list, parse_pull_progress};

    #[test]
    fn test_parse_ollama_list_empty() {
        assert_eq!(parse_ollama_list(""), Vec::<String>::new());
        assert_eq!(parse_ollama_list("\n\n"), Vec::<String>::new());
    }

    #[test]
    fn test_parse_ollama_list_header_only() {
        assert_eq!(parse_ollama_list("NAME"), Vec::<String>::new());
        assert_eq!(parse_ollama_list("NAME\tID\tSIZE\tMODIFIED"), Vec::<String>::new());
    }

    #[test]
    fn test_parse_ollama_list_models() {
        let out = "NAME\t\tID\t\tSIZE\t\tMODIFIED\nllama3.2:3b\tabc123\t2.0GB\t1 minute ago\nllama3.2:1b\tdef456\t1.2GB\t2 days ago";
        let models = parse_ollama_list(out);
        assert_eq!(models, vec!["llama3.2:3b", "llama3.2:1b"]);
    }

    #[test]
    fn test_parse_pull_progress_percent() {
        assert_eq!(parse_pull_progress("pulling manifest... 100%"), Some(100));
        assert_eq!(parse_pull_progress("pulling abc123... 45%"), Some(45));
        assert_eq!(parse_pull_progress("verifying 78%"), Some(78));
    }

    #[test]
    fn test_parse_pull_progress_mb() {
        assert_eq!(parse_pull_progress("1.5 MB / 2.0 MB"), Some(75)); // 1.5/2.0 * 100
    }

    #[test]
    fn test_parse_pull_progress_invalid() {
        assert_eq!(parse_pull_progress("downloading..."), None);
        assert_eq!(parse_pull_progress(""), None);
    }
}

async fn wait_for_service(max_secs: u64) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    for _ in 0..max_secs {
        if client.get(OLLAMA_HOST).send().await.is_ok() {
            return true;
        }
        sleep(Duration::from_secs(1)).await;
    }
    false
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub installed: bool,
    pub running: bool,
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct OllamaProgressPayload {
    pub step: String,
    pub progress: u8,
}

#[tauri::command]
pub async fn check_ollama_status() -> Result<OllamaStatus, String> {
    let (installed, which_out, _) = run_shell("which", &["ollama"])?;
    let installed = installed && which_out.contains("ollama");

    let mut models = Vec::new();
    let mut running = false;

    if installed {
        let (list_ok, list_out, _) = run_shell("ollama", &["list"])?;
        if list_ok {
            models = parse_ollama_list(&list_out);
        }

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .map_err(|e| e.to_string())?;
        running = client.get(OLLAMA_HOST).send().await.is_ok();
    }

    Ok(OllamaStatus {
        installed,
        running,
        models,
    })
}

#[tauri::command]
pub async fn install_ollama(app: AppHandle) -> Result<(), String> {
    emit_progress(&app, "Downloading Ollama...", 10);
    let output = TokioCommand::new("curl")
        .args(["-fsSL", OLLAMA_INSTALL_URL, "-o", OLLAMA_INSTALL_PATH])
        .output()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;
    if !output.status.success() {
        return Err("Failed to download Ollama installer".to_string());
    }

    emit_progress(&app, "Making installer executable...", 25);
    let (chmod_ok, _, chmod_err) = run_shell("chmod", &["+x", OLLAMA_INSTALL_PATH])?;
    if !chmod_ok {
        return Err(format!("chmod failed: {}", chmod_err));
    }

    emit_progress(&app, "Installing Ollama...", 50);
    let (install_ok, _, install_err) = run_shell("sh", &[OLLAMA_INSTALL_PATH])?;
    if !install_ok {
        return Err(format!("Install failed: {}", install_err));
    }

    emit_progress(&app, "Starting Ollama service...", 80);
    let _ = start_ollama_service().await;

    if wait_for_service(10).await {
        emit_progress(&app, "Ready", 100);
        Ok(())
    } else {
        Err("Ollama installed but service did not start in time".to_string())
    }
}

#[tauri::command]
pub async fn start_ollama_service() -> Result<(), String> {
    let mut child = TokioCommand::new("ollama")
        .arg("serve")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start ollama serve: {}", e))?;

    // Detach so it runs in background
    let _ = child.stdout.take();
    let _ = child.stderr.take();

    sleep(Duration::from_secs(2)).await;
    if wait_for_service(8).await {
        Ok(())
    } else {
        Err("Ollama service did not become ready".to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub total_memory_gb: f64,
    pub cpu_count: u32,
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    let sys = sysinfo::System::new_all();
    let total_mem = sys.total_memory();
    let total_gb = total_mem as f64 / (1024.0 * 1024.0 * 1024.0);
    let cpu_count = sys.cpus().len() as u32;
    Ok(SystemInfo {
        total_memory_gb: (total_gb * 100.0).round() / 100.0,
        cpu_count: cpu_count.max(1),
    })
}

#[tauri::command]
pub async fn delete_model(model_name: String) -> Result<(), String> {
    let name = model_name.trim();
    if name.is_empty() {
        return Err("Model name is required".to_string());
    }

    let (ok, stdout, stderr) = run_shell("ollama", &["rm", name])?;
    if ok {
        Ok(())
    } else {
        let msg = strip_ansi(&stderr);
        let msg = if msg.is_empty() {
            strip_ansi(&stdout)
        } else {
            msg
        };
        let msg = if msg.is_empty() {
            "Unknown error".to_string()
        } else {
            msg
        };
        Err(format!("Failed to delete model: {}", msg))
    }
}

#[tauri::command]
pub async fn pull_model(model_name: String, app: AppHandle) -> Result<(), String> {
    let name = model_name.trim();
    if name.is_empty() {
        return Err("Model name is required".to_string());
    }

    emit_progress(&app, &format!("Pulling {}...", name), 0);

    let mut child = TokioCommand::new("ollama")
        .arg("pull")
        .arg(name)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run ollama pull: {}", e))?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr".to_string())?;

    let mut reader = BufReader::new(stderr).lines();

    while let Ok(Some(line)) = reader.next_line().await {
        if let Some(p) = parse_pull_progress(&line) {
            emit_progress(&app, &format!("Pulling {}...", name), p);
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if status.success() {
        emit_progress(&app, "Pull complete", 100);
        Ok(())
    } else {
        Err(format!("ollama pull failed with exit code: {:?}", status.code()))
    }
}
