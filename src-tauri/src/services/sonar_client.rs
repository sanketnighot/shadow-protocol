//! Perplexity Sonar API client for real-time market intelligence.

use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::time::Duration;
use super::settings;

const SONAR_API_URL: &str = "https://api.perplexity.ai/chat/completions";
const SONAR_MODEL: &str = "sonar-pro"; // Or sonar-reasoning-pro

#[derive(Debug, Serialize)]
struct SonarRequest {
    model: String,
    messages: Vec<SonarMessage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SonarMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct SonarResponse {
    choices: Vec<SonarChoice>,
}

#[derive(Debug, Deserialize)]
struct SonarChoice {
    message: SonarMessage,
}

pub async fn search(query: &str) -> Result<String, String> {
    let api_key = settings::get_perplexity_key()
        .map_err(|e| format!("Keychain error: {}", e))?
        .ok_or_else(|| "Missing Perplexity API Key in Settings".to_string())?;

    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let body = SonarRequest {
        model: SONAR_MODEL.to_string(),
        messages: vec![
            SonarMessage {
                role: "system".into(),
                content: "You are Shadow Oracle, a world-class financial research agent. Provide cited, objective market analysis, news, and technical data. Do NOT provide financial advice. Focus on facts, recent events, and risk catalysts.".into(),
            },
            SonarMessage {
                role: "user".into(),
                content: query.into(),
            },
        ],
    };

    let resp = client
        .post(SONAR_API_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_else(|_| "Unknown error".into());
        return Err(format!("Sonar API error ({}): {}", status, err_text));
    }

    let sonar_resp: SonarResponse = resp.json().await.map_err(|e| e.to_string())?;
    
    sonar_resp.choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "Empty response from Sonar".to_string())
}
