//! Routes tool requests from model output and dispatches execution.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::apps::{self, flow, lit};
use super::apps::state as apps_state;
use super::local_db::{self, DbError};
use super::sonar_client;
use super::tool_registry;
use super::tools::{
    build_panic_routes, calculate_drift, get_token_price, get_total_portfolio_value,
    get_total_portfolio_value_multi, get_wallet_balances, get_wallet_balances_multi,
    prepare_strategy_proposal, prepare_swap_preview,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct ToolCall {
    pub name: String,
    pub parameters: serde_json::Value,
}

/// Parses ALL JSON tool calls from the LLM output.
/// Expects format: {"name": "tool_name", "parameters": {...}}
pub(crate) fn parse_tool_calls(text: &str) -> Vec<ToolCall> {
    let mut results = Vec::new();
    let mut current_pos = 0;

    while let Some(start) = text[current_pos..].find('{') {
        let abs_start = current_pos + start;
        let mut brace_count = 0;
        let mut end_pos = None;

        for (i, c) in text[abs_start..].chars().enumerate() {
            if c == '{' {
                brace_count += 1;
            } else if c == '}' {
                brace_count -= 1;
                if brace_count == 0 {
                    end_pos = Some(abs_start + i);
                    break;
                }
            }
        }

        if let Some(end) = end_pos {
            let potential_json = &text[abs_start..=end];
            if let Ok(call) = serde_json::from_str::<ToolCall>(potential_json) {
                results.push(call);
            }
            current_pos = end + 1;
        } else {
            current_pos = abs_start + 1;
        }

        if current_pos >= text.len() {
            break;
        }
    }

    results
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ToolResult {
    AssistantMessage { content: String },
    ToolOutput {
        tool_name: String,
        content: String,
    },
    ApprovalRequired {
        tool_name: String,
        payload: serde_json::Value,
    },
    Error { message: String },
}

fn ensure_app_tool_gate(app: &AppHandle, def: &tool_registry::ToolDef) -> Result<(), String> {
    if let Some(app_id) = def.required_app_id {
        if !apps_state::is_tool_app_ready(app_id).map_err(|e: DbError| e.to_string())? {
            return Err(format!(
                "Install and enable the '{}' integration under Apps (complete permission review).",
                app_id
            ));
        }
        apps::permissions::assert_permissions_granted(app_id, def.required_permission_ids)?;
    }
    let _ = app;
    Ok(())
}

fn router_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub async fn route_and_execute(
    app: &AppHandle,
    model_output: &str,
    wallet_address: Option<&str>,
    wallet_addresses: &[String],
) -> Result<Vec<ToolResult>, String> {
    let calls = parse_tool_calls(model_output);

    let mut results = Vec::new();

    let mut text_content = model_output.to_string();
    for call in &calls {
        let call_json = serde_json::to_string(call).unwrap_or_default();
        text_content = text_content.replace(&call_json, "");
    }

    let cleaned_text = text_content.trim();
    if !cleaned_text.is_empty() && !cleaned_text.starts_with('{') {
        results.push(ToolResult::AssistantMessage {
            content: cleaned_text.to_string(),
        });
    }

    if calls.is_empty() {
        if results.is_empty() {
            results.push(ToolResult::AssistantMessage {
                content: model_output.to_string(),
            });
        }
        return Ok(results);
    }

    for call in calls {
        let def = match tool_registry::all_tools()
            .into_iter()
            .find(|t| t.name == call.name)
        {
            Some(d) => d,
            None => {
                results.push(ToolResult::Error {
                    message: format!("Unknown tool: {}", call.name),
                });
                continue;
            }
        };

        let has_addresses = !wallet_addresses.is_empty();
        let address = wallet_address
            .unwrap_or(wallet_addresses.first().map(String::as_str).unwrap_or(""));
        if def.requires_wallet && !has_addresses && address.is_empty() {
            results.push(ToolResult::Error {
                message: "No wallet address. Please connect a wallet first.".to_string(),
            });
            continue;
        }

        if let Err(msg) = ensure_app_tool_gate(app, &def) {
            results.push(ToolResult::Error { message: msg });
            continue;
        }

        let res = match def.name {
            "get_wallet_balances" => {
                let addrs: Vec<&str> = wallet_addresses
                    .iter()
                    .map(String::as_str)
                    .filter(|s| !s.is_empty())
                    .collect();
                let res = if addrs.is_empty() {
                    get_wallet_balances(app, address).await
                } else {
                    get_wallet_balances_multi(app, &addrs).await
                };
                let res = res.map_err(|e| e.to_string())?;
                let content = serde_json::to_string(&res).unwrap_or_else(|_| "[]".into());
                ToolResult::ToolOutput {
                    tool_name: def.name.to_string(),
                    content,
                }
            }
            "get_total_portfolio_value" => {
                let addrs: Vec<&str> = wallet_addresses
                    .iter()
                    .map(String::as_str)
                    .filter(|s| !s.is_empty())
                    .collect();
                let res = if addrs.is_empty() {
                    get_total_portfolio_value(app, address).await
                } else {
                    get_total_portfolio_value_multi(app, &addrs).await
                };
                let content = serde_json::to_string(&res).unwrap_or_else(|_| "{}".into());
                ToolResult::ToolOutput {
                    tool_name: def.name.to_string(),
                    content,
                }
            }
            "get_token_price" => {
                let symbol = call
                    .parameters
                    .get("tokenSymbol")
                    .and_then(|v| v.as_str())
                    .unwrap_or("ETH");
                let res = get_token_price(symbol).await.map_err(|e| e.to_string())?;
                let content = serde_json::to_string(&res).unwrap_or_else(|_| "{}".into());
                ToolResult::ToolOutput {
                    tool_name: def.name.to_string(),
                    content,
                }
            }
            "web_research" => {
                let query = call
                    .parameters
                    .get("query")
                    .and_then(|v| v.as_str())
                    .ok_or("Missing query for web_research")?;
                let res = sonar_client::search(query).await?;
                ToolResult::ToolOutput {
                    tool_name: def.name.to_string(),
                    content: res,
                }
            }
            "analyze_portfolio_history" => {
                let limit = call
                    .parameters
                    .get("limit")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(10) as u32;
                let snapshots = local_db::get_portfolio_snapshots(limit).map_err(|e| e.to_string())?;
                let content = serde_json::to_string(&snapshots).unwrap_or_else(|_| "[]".into());
                ToolResult::ToolOutput {
                    tool_name: def.name.to_string(),
                    content,
                }
            }
            "execute_token_swap" => {
                let from = call
                    .parameters
                    .get("fromToken")
                    .and_then(|v| v.as_str())
                    .unwrap_or("USDC");
                let to = call
                    .parameters
                    .get("toToken")
                    .and_then(|v| v.as_str())
                    .unwrap_or("ETH");
                let amount = call
                    .parameters
                    .get("amount")
                    .and_then(|v| v.as_str())
                    .unwrap_or("0");
                let chain = call
                    .parameters
                    .get("chain")
                    .and_then(|v| v.as_str())
                    .unwrap_or("ETH");
                let slippage = call.parameters.get("slippage").and_then(|v| v.as_f64());

                match prepare_swap_preview(from, to, amount, chain, slippage) {
                    Ok(preview) => {
                        let payload = serde_json::to_value(&preview).unwrap_or(serde_json::json!({}));
                        ToolResult::ApprovalRequired {
                            tool_name: def.name.to_string(),
                            payload,
                        }
                    }
                    Err(e) => ToolResult::Error {
                        message: e.to_string(),
                    },
                }
            }
            "create_automation_strategy" => {
                let name = call
                    .parameters
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("New Strategy");
                let summary = call
                    .parameters
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let trigger = call
                    .parameters
                    .get("trigger")
                    .cloned()
                    .unwrap_or(serde_json::json!({}));
                let action = call
                    .parameters
                    .get("action")
                    .cloned()
                    .unwrap_or(serde_json::json!({}));
                let guardrails = call
                    .parameters
                    .get("guardrails")
                    .cloned()
                    .unwrap_or(serde_json::json!({}));

                match prepare_strategy_proposal(
                    name.to_string(),
                    summary.to_string(),
                    trigger,
                    action,
                    guardrails,
                ) {
                    Ok(proposal) => {
                        let payload = serde_json::to_value(&proposal).unwrap_or(serde_json::json!({}));
                        ToolResult::ApprovalRequired {
                            tool_name: def.name.to_string(),
                            payload,
                        }
                    }
                    Err(e) => ToolResult::Error {
                        message: e.to_string(),
                    },
                }
            }
            "calculate_portfolio_drift" => {
                let target_allocs =
                    if let Some(arr) = call
                        .parameters
                        .get("targetAllocations")
                        .and_then(|v| v.as_array())
                    {
                        arr.iter()
                            .filter_map(|v| {
                                let symbol = v.get("symbol")?.as_str()?.to_string();
                                let percentage = v.get("percentage")?.as_f64()?;
                                Some(local_db::TargetAllocation { symbol, percentage })
                            })
                            .collect()
                    } else {
                        local_db::get_target_allocations().map_err(|e| e.to_string())?
                    };

                match calculate_drift(app, target_allocs, wallet_addresses).await {
                    Ok(res) => {
                        let content = serde_json::to_string(&res).unwrap_or_else(|_| "{}".into());
                        ToolResult::ToolOutput {
                            tool_name: def.name.to_string(),
                            content,
                        }
                    }
                    Err(e) => ToolResult::Error {
                        message: e.to_string(),
                    },
                }
            }
            "build_emergency_eject_route" => {
                let assets = call
                    .parameters
                    .get("assets")
                    .and_then(|v| v.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();
                let destination = call
                    .parameters
                    .get("destination")
                    .and_then(|v| v.as_str())
                    .unwrap_or("USDC");

                match build_panic_routes(assets, destination.to_string(), wallet_addresses).await {
                    Ok(res) => {
                        let content = serde_json::to_string(&res).unwrap_or_else(|_| "{}".into());
                        ToolResult::ToolOutput {
                            tool_name: def.name.to_string(),
                            content,
                        }
                    }
                    Err(e) => ToolResult::Error {
                        message: e.to_string(),
                    },
                }
            }
            "list_automation_strategies" => match local_db::get_strategies() {
                Ok(res) => {
                    let content = serde_json::to_string(&res).unwrap_or_else(|_| "[]".into());
                    ToolResult::ToolOutput {
                        tool_name: def.name.to_string(),
                        content,
                    }
                }
                Err(e) => ToolResult::Error {
                    message: e.to_string(),
                },
            },
            "update_automation_strategy_status" => {
                let id = call.parameters.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let status = call
                    .parameters
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("active");

                let strategies = match local_db::get_strategies() {
                    Ok(s) => s,
                    Err(e) => return Ok(vec![ToolResult::Error { message: e.to_string() }]),
                };
                if let Some(mut strategy) = strategies.into_iter().find(|s| s.id == id) {
                    strategy.status = status.to_string();
                    match local_db::upsert_strategy(&strategy) {
                        Ok(_) => ToolResult::ToolOutput {
                            tool_name: def.name.to_string(),
                            content: format!("Strategy '{}' status updated to {}.", strategy.name, status),
                        },
                        Err(e) => ToolResult::Error {
                            message: e.to_string(),
                        },
                    }
                } else {
                    ToolResult::Error {
                        message: "Strategy not found.".to_string(),
                    }
                }
            }
            "lit_protocol_wallet_status" => {
                let daily = call.parameters.get("dailyLimitUsd").and_then(|v| v.as_f64());
                let mut cfg: serde_json::Value =
                    serde_json::from_str(&apps_state::get_app_config_json("lit-protocol").unwrap_or_else(|_| "{}".to_string()))
                        .unwrap_or_else(|_| serde_json::json!({}));
                if let Some(d) = daily {
                    cfg["dailyLimitUsd"] = serde_json::json!(d);
                }
                match lit::wallet_status(app, cfg).await {
                    Ok(v) => ToolResult::ToolOutput {
                        tool_name: def.name.to_string(),
                        content: serde_json::to_string(&v).unwrap_or_else(|_| "{}".into()),
                    },
                    Err(e) => ToolResult::Error { message: e },
                }
            }
            "lit_protocol_connect_wallet" => {
                // First check connectivity
                let connect_result = lit::connect_wallet(app, serde_json::json!({})).await;

                // If no PKP exists and session is unlocked, offer to mint
                let pkp_address = lit::stored_pkp_address();
                let mut data = connect_result.unwrap_or(serde_json::json!({"connected": false}));

                if pkp_address.is_none() {
                    data["hasPkp"] = serde_json::json!(false);
                    data["note"] = serde_json::json!("Connected to Lit network. No PKP agent wallet yet — create one from Apps settings.");
                } else {
                    data["hasPkp"] = serde_json::json!(true);
                    data["pkpAddress"] = serde_json::json!(pkp_address);
                }

                ToolResult::ToolOutput {
                    tool_name: def.name.to_string(),
                    content: serde_json::to_string(&data).unwrap_or_else(|_| "{}".into()),
                }
            }
            "lit_protocol_precheck_action" => {
                let kind = call
                    .parameters
                    .get("kind")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let notional = call.parameters.get("notionalUsd").and_then(|v| v.as_f64());
                let protocol = call
                    .parameters
                    .get("protocol")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let action = serde_json::json!({
                    "kind": kind,
                    "notionalUsd": notional,
                    "protocol": protocol,
                });
                match lit::precheck_action(app, action).await {
                    Ok(v) => ToolResult::ToolOutput {
                        tool_name: def.name.to_string(),
                        content: serde_json::to_string(&v).unwrap_or_else(|_| "{}".into()),
                    },
                    Err(e) => ToolResult::Error { message: e },
                }
            }
            "lit_protocol_execute_swap" => {
                let from = call.parameters.get("fromToken").and_then(|v| v.as_str()).unwrap_or("USDC");
                let to = call.parameters.get("toToken").and_then(|v| v.as_str()).unwrap_or("ETH");
                let amount = call.parameters.get("amountUsd").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let chain = call.parameters.get("chain").and_then(|v| v.as_str()).unwrap_or("ethereum");
                let protocol = call.parameters.get("protocol").and_then(|v| v.as_str()).unwrap_or("uniswap");

                // Get PKP address
                let pkp_address = lit::stored_pkp_address();

                // Run precheck through Lit first
                let precheck_payload = serde_json::json!({
                    "kind": "swap",
                    "notionalUsd": amount,
                    "protocol": protocol,
                });
                let precheck_result = lit::precheck_action(app, precheck_payload).await;

                let precheck_allowed = precheck_result
                    .as_ref()
                    .ok()
                    .and_then(|v| v.get("allowed"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let precheck_reason = precheck_result
                    .as_ref()
                    .ok()
                    .and_then(|v| v.get("reason"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                if !precheck_allowed {
                    ToolResult::Error {
                        message: format!(
                            "Lit policy check denied: {}. Adjust guardrails in Lit Protocol settings.",
                            precheck_reason
                        ),
                    }
                } else {
                    let payload = serde_json::json!({
                        "action": "lit_pkp_swap",
                        "fromToken": from,
                        "toToken": to,
                        "amountUsd": amount,
                        "chain": chain,
                        "protocol": protocol,
                        "pkpAddress": pkp_address,
                        "litPrecheckResult": {
                            "allowed": true,
                            "reason": precheck_reason,
                            "enforcedBy": "lit-tee-nodes",
                        },
                        "note": "User approval required before PKP signs this transaction via Lit's MPC network.",
                    });
                    ToolResult::ApprovalRequired {
                        tool_name: def.name.to_string(),
                        payload,
                    }
                }
            }
            "flow_protocol_account_status" => match flow::account_status(app).await {
                Ok(v) => ToolResult::ToolOutput {
                    tool_name: def.name.to_string(),
                    content: serde_json::to_string(&v).unwrap_or_else(|_| "{}".into()),
                },
                Err(e) => ToolResult::Error { message: e },
            },
            "flow_protocol_prepare_sponsored_transaction" => {
                let summary = call
                    .parameters
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Flow action");
                let cadence = call
                    .parameters
                    .get("cadenceNote")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let payload = serde_json::json!({
                    "summary": summary,
                    "cadenceNote": cadence,
                });
                ToolResult::ApprovalRequired {
                    tool_name: def.name.to_string(),
                    payload,
                }
            }
            "filecoin_protocol_list_backups" => {
                let limit = call
                    .parameters
                    .get("limit")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(20) as u32;
                match apps_state::list_app_backups("filecoin-storage", limit) {
                    Ok(rows) => ToolResult::ToolOutput {
                        tool_name: def.name.to_string(),
                        content: serde_json::to_string(&rows).unwrap_or_else(|_| "[]".into()),
                    },
                    Err(e) => ToolResult::Error {
                        message: format!("{e}"),
                    },
                }
            }
            "filecoin_protocol_request_backup" => {
                let mem = call
                    .parameters
                    .get("includeAgentMemory")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let persona = call
                    .parameters
                    .get("includePersona")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let scope = serde_json::json!({
                    "agentMemory": mem,
                    "persona": persona,
                    "configs": true,
                });
                ToolResult::ApprovalRequired {
                    tool_name: def.name.to_string(),
                    payload: serde_json::json!({ "scope": scope }),
                }
            }
            "filecoin_protocol_request_restore" => {
                let cid = call
                    .parameters
                    .get("cid")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if cid.len() < 8 {
                    ToolResult::Error {
                        message: "Invalid CID".to_string(),
                    }
                } else {
                    ToolResult::ApprovalRequired {
                        tool_name: def.name.to_string(),
                        payload: serde_json::json!({ "cid": cid }),
                    }
                }
            }
            "apps_schedule_integration_job" => {
                let Some(target) = call.parameters.get("appId").and_then(|v| v.as_str()) else {
                    results.push(ToolResult::Error {
                        message: "Missing appId".to_string(),
                    });
                    continue;
                };
                let kind = call
                    .parameters
                    .get("kind")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let interval = call
                    .parameters
                    .get("intervalSeconds")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                if interval < 60 {
                    results.push(ToolResult::Error {
                        message: "intervalSeconds must be at least 60.".to_string(),
                    });
                    continue;
                }
                if target != "flow" && target != "filecoin-storage" {
                    results.push(ToolResult::Error {
                        message: "appId must be flow or filecoin-storage.".to_string(),
                    });
                    continue;
                }
                if !apps_state::is_tool_app_ready(target).unwrap_or(false) {
                    results.push(ToolResult::Error {
                        message: format!("App '{target}' must be active to schedule jobs."),
                    });
                    continue;
                }
                let perm_check = match kind {
                    "flow_recurring_prepare" => {
                        apps::permissions::assert_permissions_granted(
                            "flow",
                            &["flow.tx.prepare", "network.flow"],
                        )
                    }
                    "filecoin_autobackup" => apps::permissions::assert_permissions_granted(
                        "filecoin-storage",
                        &["backup.read_local_state", "network.filecoin"],
                    ),
                    _ => Err("kind must be flow_recurring_prepare or filecoin_autobackup.".to_string()),
                };
                if let Err(m) = perm_check {
                    results.push(ToolResult::Error { message: m });
                    continue;
                }
                let payload = call
                    .parameters
                    .get("payload")
                    .cloned()
                    .unwrap_or(serde_json::json!({}));
                let now = router_now();
                let row = apps_state::AppSchedulerJobRow {
                    id: uuid::Uuid::new_v4().to_string(),
                    app_id: target.to_string(),
                    kind: kind.to_string(),
                    payload_json: payload.to_string(),
                    interval_secs: interval as i64,
                    next_run_at: now,
                    enabled: true,
                    created_at: now,
                    updated_at: now,
                };
                match apps_state::upsert_scheduler_job(&row) {
                    Ok(_) => ToolResult::ToolOutput {
                        tool_name: def.name.to_string(),
                        content: serde_json::to_string(&serde_json::json!({
                            "jobId": row.id,
                            "nextRunAt": row.next_run_at
                        }))
                        .unwrap_or_else(|_| "{}".into()),
                    },
                    Err(e) => ToolResult::Error {
                        message: format!("{e}"),
                    },
                }
            }
            _ => {
                results.push(ToolResult::Error {
                    message: format!("Unknown tool: {}", def.name),
                });
                continue;
            }
        };
        results.push(res);
    }

    Ok(results)
}

/// Runtime context injected into the system prompt so the LLM knows what app state exists.
#[derive(Debug, Clone)]
pub struct AgentContext {
    pub wallet_count: u32,
    pub active_address: Option<String>,
    pub all_addresses: Vec<String>,
}

impl AgentContext {
    pub fn has_wallets(&self) -> bool {
        self.wallet_count > 0
    }

    pub fn is_multi_wallet(&self) -> bool {
        self.wallet_count > 1
    }
}

pub fn tools_system_prompt(ctx: &AgentContext) -> String {
    let tools = tool_registry::all_tools();
    let tools_json = serde_json::to_string_pretty(&tools.iter().map(|t| {
        serde_json::json!({
            "name": t.name,
            "description": t.description,
            "requiresAppId": t.required_app_id,
            "parameters": serde_json::from_str::<serde_json::Value>(t.parameters).unwrap_or(serde_json::json!({"type": "object"}))
        })
    }).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".to_string());

    let integrations = apps::prompt_block();

    let ctx_block = if ctx.has_wallets() {
        let multi = if ctx.is_multi_wallet() {
            " (multi-wallet; aggregate by default)"
        } else {
            ""
        };
        format!(
            r#"
## APP CONTEXT (auto-inject; NEVER ask user for this)

- Connected wallets: {}{}
- Active wallet: {}
- Addresses for tools: {}
- You have direct access. Call tools automatically. Never say "I don't have access", "please provide", "you should call"."#,
            ctx.wallet_count,
            multi,
            ctx.active_address
                .as_deref()
                .unwrap_or("(first of connected)"),
            ctx.all_addresses
                .iter()
                .map(|a| {
                    if a.len() > 12 {
                        format!("{}…{}", &a[..6], &a[a.len() - 4..])
                    } else {
                        a.clone()
                    }
                })
                .collect::<Vec<_>>()
                .join(", ")
        )
    } else {
        r#"
## APP CONTEXT
- No wallets connected. For portfolio/balance questions: output "Decision: hold. Reason: No wallet context. Connect a wallet in Settings to enable portfolio." For token price (e.g. ETH price?): call get_token_price() — no wallet needed."#
            .to_string()
    };

    format!(
        r#"You are an autonomous DeFi execution agent. You have direct access to tools.

You DO NOT ask the user to call tools.
You DO NOT ask for missing data.
You DO NOT say you lack access.

Instead: automatically call tools when needed, process results, return a final decision.

You are NOT a chatbot. You observe, analyze, decide, output.

FORBIDDEN: "please call", "you should call", "try using", "provide wallet address", "I don't have access".

When using a tool, you MUST output ONLY a valid JSON object in the following format:
{{"name": "tool_name", "parameters": {{"param1": "value1"}}}}

{ctx_block}

{integrations}

Available tools:
{tools_json}

Examples:
"portfolio?" → {{"name": "get_total_portfolio_value", "parameters": {{}}}}
"ETH price?" → {{"name": "get_token_price", "parameters": {{"tokenSymbol": "ETH"}}}}
"is ARB risky?" → {{"name": "web_research", "parameters": {{"query": "Arbitrum project risks and latest news March 2026"}}}}
"hello" → Hi! I'm Shadow. I can analyze your portfolio, research the web, or help with swaps. What do you need?"#
    )
}
