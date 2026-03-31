//! Ollama HTTP client for chat and generate.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use super::settings;

const OLLAMA_HOST: &str = "http://localhost:11434";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<ChatOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
struct ChatOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    num_ctx: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Debug, Serialize)]
struct OllamaMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    message: Option<ChatResponseMessage>,
}

#[derive(Debug, Deserialize)]
struct ChatResponseMessage {
    content: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum OllamaError {
    #[error("Request failed: {0}")]
    RequestFailed(String),
}

pub async fn chat(
    client: &Client,
    model: &str,
    messages: &[(String, String)],
    num_ctx: Option<u32>,
) -> Result<String, OllamaError> {
    chat_with_settings(client, model, messages, num_ctx, None, None).await
}

pub async fn chat_with_settings(
    client: &Client,
    model: &str,
    messages: &[(String, String)],
    num_ctx: Option<u32>,
    temperature: Option<f32>,
    format: Option<serde_json::Value>,
) -> Result<String, OllamaError> {
    let ollama_messages: Vec<OllamaMessage> = messages
        .iter()
        .map(|(role, content)| OllamaMessage {
            role: role.clone(),
            content: content.clone(),
        })
        .collect();

    let body = ChatRequest {
        model: model.to_string(),
        messages: ollama_messages,
        stream: false,
        options: if num_ctx.is_some() || temperature.is_some() {
            Some(ChatOptions { num_ctx, temperature })
        } else {
            None
        },
        format,
    };

    let url = format!("{}/api/chat", OLLAMA_HOST);
    let mut req = client.post(&url).json(&body);

    if let Ok(Some(key)) = settings::get_ollama_key() {
        if !key.trim().is_empty() {
            req = req.header("Authorization", format!("Bearer {}", key));
        }
    }

    let resp = req
        .send()
        .await
        .map_err(|e| OllamaError::RequestFailed(e.to_string()))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".into());
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(String::from))
            .unwrap_or_else(|| format!("Ollama error: {}", status));
        return Err(OllamaError::RequestFailed(msg));
    }

    let data: ChatResponse = resp
        .json()
        .await
        .map_err(|e| OllamaError::RequestFailed(e.to_string()))?;

    Ok(data
        .message
        .and_then(|m| m.content)
        .unwrap_or_default()
        .trim()
        .to_string())
}
