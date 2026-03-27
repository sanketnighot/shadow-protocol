//! Bundled catalog manifests (first-party integrations only).

use rusqlite::{params, Connection};

#[derive(Debug, Clone)]
pub struct CatalogSeedRow {
    pub id: &'static str,
    pub name: &'static str,
    pub short_description: &'static str,
    pub long_description: &'static str,
    pub icon_key: &'static str,
    pub version: &'static str,
    pub author: &'static str,
    pub features_json: &'static str,
    pub permissions_json: &'static str,
    pub secret_requirements_json: &'static str,
    pub agent_tools_json: &'static str,
    pub network_scopes_json: &'static str,
}

pub fn bundled_catalog() -> &'static [CatalogSeedRow] {
    &[
        CatalogSeedRow {
            id: "lit-protocol",
            name: "Lit Protocol",
            short_description: "PKP / Vincent agent wallet policies",
            long_description: "Configure a Lit-backed agent execution wallet with programmable guardrails. SHADOW remains the user-facing policy owner; Vincent provides enforcement infrastructure.",
            icon_key: "Zap",
            version: "1.0.0",
            author: "SHADOW (bundled)",
            features_json: r#"["PKP-oriented wallet lifecycle","Policy guardrails mirrored from SHADOW","Precheck before execution"]"#,
            permissions_json: r#"["agent_wallet.manage","execution.precheck","network.lit"]"#,
            secret_requirements_json: r#"[]"#,
            agent_tools_json: r#"["lit_protocol_wallet_status","lit_protocol_precheck_action"]"#,
            network_scopes_json: r#"["lit-protocol"]"#,
        },
        CatalogSeedRow {
            id: "flow",
            name: "Flow",
            short_description: "Flow account & sponsored transactions",
            long_description: "Connect a Flow account and prepare sponsored Cadence transactions. Recurring flows are scheduled by SHADOW, not promised as a native Flow primitive.",
            icon_key: "Waves",
            version: "1.0.0",
            author: "SHADOW (bundled)",
            features_json: r#"["Account connectivity","Sponsored transaction preparation","SHADOW scheduler jobs"]"#,
            permissions_json: r#"["flow.account.read","flow.tx.prepare","network.flow"]"#,
            secret_requirements_json: r#"[]"#,
            agent_tools_json: r#"["flow_protocol_account_status","flow_protocol_prepare_sponsored_transaction"]"#,
            network_scopes_json: r#"["flow"]"#,
        },
        CatalogSeedRow {
            id: "filecoin-storage",
            name: "Filecoin Backup",
            short_description: "Encrypted snapshots to Filecoin",
            long_description: "Create encrypted backups of agent memory, configs, and strategy metadata. Filecoin is storage only — ciphertext is produced locally before any upload.",
            icon_key: "HardDrive",
            version: "1.0.0",
            author: "SHADOW (bundled)",
            features_json: r#"["Encrypted backup","Restore workflow","CID history","Optional auto-backup"]"#,
            permissions_json: r#"["backup.read_local_state","network.filecoin"]"#,
            secret_requirements_json: r#"[]"#,
            agent_tools_json: r#"["filecoin_protocol_list_backups","filecoin_protocol_request_backup","filecoin_protocol_request_restore"]"#,
            network_scopes_json: r#"["filecoin"]"#,
        },
    ]
}

#[allow(dead_code)]
pub fn permission_labels() -> &'static [(&'static str, &'static str)] {
    &[
        ("agent_wallet.manage", "Manage Lit agent wallet lifecycle and policies"),
        ("execution.precheck", "Run execution prechecks against configured guardrails"),
        ("network.lit", "Reach Lit network endpoints for wallet operations"),
        ("flow.account.read", "Read Flow account connectivity status"),
        ("flow.tx.prepare", "Build and prepare Flow transactions for signing or sponsorship"),
        ("network.flow", "Reach Flow access nodes"),
        ("backup.read_local_state", "Read local app/agent state to build encrypted backups"),
        ("network.filecoin", "Upload encrypted backup payloads to Filecoin storage"),
    ]
}

pub fn seed_catalog_if_empty(conn: &Connection) -> Result<(), rusqlite::Error> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM apps_catalog", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    for row in bundled_catalog() {
        conn.execute(
            r#"INSERT INTO apps_catalog (
                id, name, short_description, long_description, icon_key, version, author,
                features_json, permissions_json, secret_requirements_json, agent_tools_json, network_scopes_json, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"#,
            params![
                row.id,
                row.name,
                row.short_description,
                row.long_description,
                row.icon_key,
                row.version,
                row.author,
                row.features_json,
                row.permissions_json,
                row.secret_requirements_json,
                row.agent_tools_json,
                row.network_scopes_json,
                now,
            ],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_catalog_covers_three_integrations() {
        let ids: Vec<&str> = bundled_catalog().iter().map(|r| r.id).collect();
        assert_eq!(
            ids,
            vec!["lit-protocol", "flow", "filecoin-storage"]
        );
    }
}
