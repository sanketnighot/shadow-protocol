//! Localhost redirect for Vincent user connect: JWT is appended as `?jwt=` on redirect (Vincent convention).
//! `shadow://` is not delivered into the desktop app, so loopback is required.
//!
//! Register in the Vincent dashboard (allowed redirect URIs):
//! `http://127.0.0.1:<port>/vincent-consent` — default port `53682`, or `SHADOW_VINCENT_LOOPBACK_PORT`.

use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::io::AsyncReadExt;
use tokio::sync::Mutex as AsyncMutex;

/// Default matches common desktop-OAuth style ports; override with `SHADOW_VINCENT_LOOPBACK_PORT`.
pub fn loopback_redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{port}/vincent-consent")
}

/// Redirect URI for the current loopback port (for dashboard allow-list and UI copy).
pub fn loopback_redirect_uri_for_config() -> String {
    loopback_redirect_uri(loopback_port())
}

fn loopback_port() -> u16 {
    std::env::var("SHADOW_VINCENT_LOOPBACK_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(53_682)
}

fn consent_page_url(app_id: &str, redirect_uri: &str) -> Result<String, String> {
    let id = app_id.trim();
    if id.is_empty()
        || id.len() > 64
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Vincent App ID is invalid.".to_string());
    }
    let enc = urlencoding::encode(redirect_uri);
    Ok(format!(
        "https://dashboard.heyvincent.ai/user/appId/{id}/connect?redirectUri={enc}",
    ))
}

/// Extract `jwt` query param from the first line of an HTTP/1.x request.
fn extract_jwt_from_request_prefix(request_head: &str) -> Option<String> {
    let line = request_head.lines().next()?;
    let mut parts = line.split_whitespace();
    let _method = parts.next()?;
    let path_query = parts.next()?;
    let q = path_query.split_once('?')?.1;
    for pair in q.split('&') {
        let (k, v) = pair.split_once('=')?;
        if k == "jwt" {
            return Some(urlencoding::decode(v).ok()?.into_owned());
        }
    }
    None
}

async fn read_http_head(stream: &mut tokio::net::TcpStream) -> std::io::Result<Vec<u8>> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 512];
    loop {
        if buf.len() > 16_384 {
            break;
        }
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }
    Ok(buf)
}

async fn send_ok_close_tab(stream: &mut tokio::net::TcpStream) -> std::io::Result<()> {
    let body = b"<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>SHADOW</title></head><body><p>Consent received. You can close this tab and return to SHADOW.</p></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    use tokio::io::AsyncWriteExt;
    stream.write_all(response.as_bytes()).await?;
    stream.write_all(body).await?;
    stream.flush().await?;
    Ok(())
}

async fn send_400(stream: &mut tokio::net::TcpStream) -> std::io::Result<()> {
    let body = b"Bad Request";
    let response = format!(
        "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    use tokio::io::AsyncWriteExt;
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.write_all(body).await;
    let _ = stream.flush().await;
    Ok(())
}

pub struct VincentLoopbackState {
    active: Arc<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>>,
    cancel: Arc<AtomicBool>,
    jwt: Arc<AsyncMutex<Option<String>>>,
    last_error: Arc<Mutex<Option<String>>>,
}

impl Default for VincentLoopbackState {
    fn default() -> Self {
        Self {
            active: Arc::new(Mutex::new(None)),
            cancel: Arc::new(AtomicBool::new(false)),
            jwt: Arc::new(AsyncMutex::new(None)),
            last_error: Arc::new(Mutex::new(None)),
        }
    }
}

impl VincentLoopbackState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start_capture(&self, app_id: String) -> Result<String, String> {
        self.cancel.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.active.lock() {
            if let Some(h) = guard.take() {
                h.abort();
            }
        }
        self.cancel.store(false, Ordering::SeqCst);

        if let Ok(mut g) = self.last_error.lock() {
            *g = None;
        }

        let port = loopback_port();
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let redirect = loopback_redirect_uri(port);
        let open_url = consent_page_url(&app_id, &redirect)?;

        let std_listener = std::net::TcpListener::bind(addr).map_err(|e| {
            format!(
                "Could not bind {addr} ({e}). Set SHADOW_VINCENT_LOOPBACK_PORT or free the port."
            )
        })?;
        std_listener
            .set_nonblocking(true)
            .map_err(|e| format!("Vincent loopback listener: {e}"))?;
        let listener = tokio::net::TcpListener::from_std(std_listener)
            .map_err(|e| format!("Vincent loopback listener: {e}"))?;

        let cancel = Arc::clone(&self.cancel);
        let jwt_slot = Arc::clone(&self.jwt);
        let err_slot = Arc::clone(&self.last_error);

        let handle = tauri::async_runtime::spawn(async move {
            let deadline = Instant::now() + Duration::from_secs(600);

            loop {
                if cancel.load(Ordering::SeqCst) {
                    return;
                }
                if Instant::now() > deadline {
                    if let Ok(mut g) = err_slot.lock() {
                        *g = Some("Timed out waiting for Vincent redirect (10 minutes).".to_string());
                    }
                    return;
                }

                match tokio::time::timeout(Duration::from_millis(500), listener.accept()).await {
                    Ok(Ok((mut stream, _))) => {
                        let head = match tokio::time::timeout(
                            Duration::from_secs(30),
                            read_http_head(&mut stream),
                        )
                        .await
                        {
                            Ok(Ok(b)) => b,
                            _ => {
                                let _ = send_400(&mut stream).await;
                                continue;
                            }
                        };

                        let text = String::from_utf8_lossy(&head);
                        if let Some(jwt) = extract_jwt_from_request_prefix(&text) {
                            let _ = send_ok_close_tab(&mut stream).await;
                            *jwt_slot.lock().await = Some(jwt);
                            return;
                        }
                        let _ = send_400(&mut stream).await;
                    }
                    Ok(Err(_)) => continue,
                    Err(_) => continue,
                }
            }
        });

        if let Ok(mut g) = self.active.lock() {
            *g = Some(handle);
        }

        Ok(open_url)
    }

    fn take_error(&self) -> Option<String> {
        self.last_error.lock().ok().and_then(|mut g| g.take())
    }

    /// Single poll for UI: returns JWT if redirect succeeded, or error if bind failed / timed out.
    pub async fn take_loopback_result(&self) -> (Option<String>, Option<String>) {
        let err = self.take_error();
        let jwt = self.jwt.lock().await.take();
        if jwt.is_some() {
            (jwt, None)
        } else {
            (None, err)
        }
    }

    pub fn cancel_capture(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.active.lock() {
            if let Some(h) = guard.take() {
                h.abort();
            }
        }
    }
}
