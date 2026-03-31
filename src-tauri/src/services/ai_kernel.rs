use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::agent_state::{read_memory, read_soul};
use super::ai_memory::AiMemoryContext;
use super::ai_profiles::{profile_config, AiProfileId};
use super::apps::state as apps_state;
use super::ollama_client;
use super::tool_registry;
use super::tool_router::{self, AgentContext};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAppCapability {
    pub app_id: String,
    pub name: String,
    pub installed: bool,
    pub enabled: bool,
    pub healthy: bool,
    pub permissioned: bool,
    pub available_tools: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiKernelMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiKernelRequest {
    pub profile: AiProfileId,
    pub model: String,
    pub messages: Vec<AiKernelMessage>,
    pub num_ctx: Option<u32>,
    pub rolling_summary: Option<String>,
    pub structured_facts: Option<String>,
    pub agent_context: AgentContext,
}

pub fn collect_app_capabilities() -> Vec<AiAppCapability> {
    let Ok(entries) = apps_state::list_marketplace() else {
        return Vec::new();
    };

    entries
        .into_iter()
        .map(|entry| {
            let installed = entry.installed.clone();
            let tools = parse_tools_json(&entry.catalog.agent_tools_json);
            AiAppCapability {
                app_id: entry.catalog.id,
                name: entry.catalog.name,
                installed: installed.is_some(),
                enabled: installed.as_ref().map(|item| item.enabled).unwrap_or(false),
                healthy: installed
                    .as_ref()
                    .map(|item| item.health_status != "error")
                    .unwrap_or(false),
                permissioned: installed
                    .as_ref()
                    .and_then(|item| item.permissions_acknowledged_at)
                    .is_some(),
                available_tools: tools,
            }
        })
        .collect()
}

pub fn build_memory_context(
    app: &AppHandle,
    rolling_summary: Option<&str>,
    structured_facts: Option<&str>,
) -> AiMemoryContext {
    let soul = read_soul(app).unwrap_or_default();
    let memory = read_memory(app).unwrap_or_default();
    AiMemoryContext::from_state(soul, memory, rolling_summary, structured_facts)
}

pub fn build_system_prompt(
    profile: AiProfileId,
    app: &AppHandle,
    agent_ctx: &AgentContext,
    rolling_summary: Option<&str>,
    structured_facts: Option<&str>,
) -> String {
    let profile_cfg = profile_config(profile);
    let memory_context = build_memory_context(app, rolling_summary, structured_facts);
    let capabilities_block = render_capability_block(&collect_app_capabilities());

    match profile {
        AiProfileId::ChatAssistant => {
            let tools_prompt = tool_router::tools_system_prompt(agent_ctx);
            format!(
                "{}\n\n## Shared AI kernel profile\n- Profile: chat_assistant\n- Guidance: {}\n\n{}\n\n{}",
                tools_prompt,
                profile_cfg.task_directive,
                memory_context.to_prompt_block(),
                capabilities_block
            )
        }
        _ => format!(
            "You are SHADOW's local AI kernel.\n\n## Active profile\n- Profile: {:?}\n- Guidance: {}\n\n{}\n\n{}",
            profile,
            profile_cfg.task_directive,
            memory_context.to_prompt_block(),
            capabilities_block
        ),
    }
}

pub fn build_request_messages(app: &AppHandle, request: &AiKernelRequest) -> Vec<(String, String)> {
    let system_prompt = build_system_prompt(
        request.profile,
        app,
        &request.agent_context,
        request.rolling_summary.as_deref(),
        request.structured_facts.as_deref(),
    );
    let mut messages = vec![("system".to_string(), system_prompt)];
    messages.extend(
        request
            .messages
            .iter()
            .map(|message| (message.role.clone(), message.content.clone())),
    );
    messages
}

pub fn resolve_num_ctx(request: &AiKernelRequest) -> Option<u32> {
    request
        .num_ctx
        .or(Some(profile_config(request.profile).default_num_ctx))
}

pub async fn summarize_conversation(
    app: &AppHandle,
    model: &str,
    messages: &[(String, String)],
    num_ctx: Option<u32>,
) -> Result<String, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let profile = profile_config(AiProfileId::ConversationSummary);
    let request = AiKernelRequest {
        profile: AiProfileId::ConversationSummary,
        model: model.to_string(),
        messages: messages
            .iter()
            .map(|(role, content)| AiKernelMessage {
                role: role.clone(),
                content: content.clone(),
            })
            .collect(),
        num_ctx,
        rolling_summary: None,
        structured_facts: None,
        agent_context: AgentContext::default(),
    };
    let request_messages = build_request_messages(app, &request);
    ollama_client::chat_with_settings(
        &client,
        model,
        &request_messages,
        resolve_num_ctx(&request).or(Some(profile.default_num_ctx)),
        profile.temperature,
        None,
    )
    .await
    .map_err(|e| e.to_string())
}

pub fn compact_tool_observation(tool_name: &str, content: &str) -> String {
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(content) {
        match tool_name {
            "get_total_portfolio_value" => {
                let total = parsed
                    .get("totalUsd")
                    .and_then(|value| value.as_str())
                    .unwrap_or("$0.00");
                let wallet_count = parsed
                    .get("walletCount")
                    .and_then(|value| value.as_u64())
                    .unwrap_or(0);
                return format!(
                    "Observation from {tool_name}: portfolio total {total} across {wallet_count} wallet(s)."
                );
            }
            "get_wallet_balances" => {
                let count = parsed.as_array().map(|items| items.len()).unwrap_or(0);
                return format!("Observation from {tool_name}: received {count} balance rows.");
            }
            "get_token_price" => {
                let price = parsed
                    .get("priceUsd")
                    .and_then(|value| value.as_f64())
                    .unwrap_or(0.0);
                return format!("Observation from {tool_name}: current price ${price:.4}.");
            }
            _ => {}
        }
    }

    let compact = content.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = if compact.len() > 220 {
        format!("{}...", &compact[..220])
    } else {
        compact
    };
    format!("Observation from {tool_name}: {trimmed}")
}

pub fn render_capability_block(capabilities: &[AiAppCapability]) -> String {
    if capabilities.is_empty() {
        return "## Installed app capabilities\n[]".to_string();
    }
    let json = serde_json::to_string_pretty(capabilities).unwrap_or_else(|_| "[]".to_string());
    let tool_summary = serde_json::to_string_pretty(&tool_registry::all_tools().iter().map(|tool| {
        serde_json::json!({
            "name": tool.name,
            "requiresAppId": tool.required_app_id,
        })
    }).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".to_string());
    format!(
        "## Installed app capabilities\n{}\n\n## Tool registry summary\n{}",
        json, tool_summary
    )
}

fn parse_tools_json(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{
        compact_tool_observation, parse_tools_json, render_capability_block, resolve_num_ctx,
        AiAppCapability, AiKernelRequest,
    };
    use crate::services::ai_profiles::AiProfileId;
    use crate::services::tool_router::AgentContext;

    #[test]
    fn parses_app_tool_lists_from_catalog_json() {
        let tools = parse_tools_json(r#"["flow_schedule_transaction","flow_bridge_tokens"]"#);
        assert_eq!(
            tools,
            vec![
                "flow_schedule_transaction".to_string(),
                "flow_bridge_tokens".to_string()
            ]
        );
    }

    #[test]
    fn compacts_large_tool_outputs_into_short_observation() {
        let observation = compact_tool_observation(
            "get_total_portfolio_value",
            r#"{"totalUsd":"$1200.00","walletCount":2}"#,
        );
        assert!(observation.contains("$1200.00"));
        assert!(observation.contains("2 wallet(s)"));
    }

    #[test]
    fn capability_block_renders_compact_machine_readable_context() {
        let block = render_capability_block(&[AiAppCapability {
            app_id: "flow".to_string(),
            name: "Flow".to_string(),
            installed: true,
            enabled: true,
            healthy: true,
            permissioned: true,
            available_tools: vec!["flow_schedule_transaction".to_string()],
        }]);
        assert!(block.contains("\"appId\": \"flow\""));
        assert!(block.contains("\"flow_schedule_transaction\""));
    }

    #[test]
    fn kernel_request_defaults_to_profile_context_budget() {
        let request = AiKernelRequest {
            profile: AiProfileId::ConversationSummary,
            model: "llama3.2:3b".to_string(),
            messages: Vec::new(),
            num_ctx: None,
            rolling_summary: None,
            structured_facts: None,
            agent_context: AgentContext::default(),
        };
        assert_eq!(resolve_num_ctx(&request), Some(4096));
    }
}
