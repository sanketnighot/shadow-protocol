use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSoul {
    pub risk_appetite: String, // e.g., "Conservative", "Aggressive"
    pub preferred_chains: Vec<String>,
    pub persona: String,
    pub custom_rules: Vec<String>,
}

impl Default for AgentSoul {
    fn default() -> Self {
        Self {
            risk_appetite: "Moderate".to_string(),
            preferred_chains: vec!["Base".to_string(), "Ethereum".to_string()],
            persona: "You are a helpful, secure, and proactive DeFi companion.".to_string(),
            custom_rules: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMemoryItem {
    pub id: String,
    pub fact: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentMemory {
    pub facts: Vec<AgentMemoryItem>,
}

fn get_state_file_path(app: &AppHandle, filename: &str) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| {
        if !dir.exists() {
            let _ = fs::create_dir_all(&dir);
        }
        dir.join(filename)
    })
}

pub fn read_soul(app: &AppHandle) -> Result<AgentSoul, String> {
    let path = get_state_file_path(app, "soul.json").ok_or("Failed to get app data dir")?;
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(AgentSoul::default())
    }
}

pub fn write_soul(app: &AppHandle, soul: &AgentSoul) -> Result<(), String> {
    let path = get_state_file_path(app, "soul.json").ok_or("Failed to get app data dir")?;
    let content = serde_json::to_string_pretty(soul).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn read_memory(app: &AppHandle) -> Result<AgentMemory, String> {
    let path = get_state_file_path(app, "memory.json").ok_or("Failed to get app data dir")?;
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(AgentMemory::default())
    }
}

pub fn write_memory(app: &AppHandle, memory: &AgentMemory) -> Result<(), String> {
    let path = get_state_file_path(app, "memory.json").ok_or("Failed to get app data dir")?;
    let content = serde_json::to_string_pretty(memory).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn add_memory_fact(app: &AppHandle, fact: String) -> Result<AgentMemoryItem, String> {
    let mut memory = read_memory(app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    
    let item = AgentMemoryItem {
        id,
        fact,
        created_at,
    };
    
    memory.facts.push(item.clone());
    write_memory(app, &memory)?;
    
    Ok(item)
}

pub fn remove_memory_fact(app: &AppHandle, id: &str) -> Result<(), String> {
    let mut memory = read_memory(app)?;
    memory.facts.retain(|f| f.id != id);
    write_memory(app, &memory)?;
    Ok(())
}
