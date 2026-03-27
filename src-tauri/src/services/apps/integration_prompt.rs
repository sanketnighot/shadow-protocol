//! Compact block for agent system prompt (installed integrations).

use super::state;

pub fn prompt_block() -> String {
    let Ok(rows) = state::list_marketplace() else {
        return String::new();
    };
    let mut lines = vec![
        "## Verified integrations (Apps)".to_string(),
        "These are first-party SHADOW integrations. Tools marked with requiresAppId need the app installed, permissions acknowledged, and enabled.".to_string(),
    ];
    for e in rows {
        let detail = match &e.installed {
            Some(i) => format!(
                "installed; lifecycle={}; enabled={}; health={}",
                i.lifecycle, i.enabled, i.health_status
            ),
            None => "not installed — open Apps to add".to_string(),
        };
        lines.push(format!("- **{}** (`{}`): {}", e.catalog.name, e.catalog.id, detail));
    }
    lines.join("\n")
}
