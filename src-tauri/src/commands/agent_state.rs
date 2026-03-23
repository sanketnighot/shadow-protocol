use tauri::AppHandle;
use crate::services::agent_state::{AgentSoul, AgentMemory, AgentMemoryItem, read_soul, write_soul, read_memory, add_memory_fact, remove_memory_fact};

#[tauri::command]
pub async fn get_agent_soul(app: AppHandle) -> Result<AgentSoul, String> {
    read_soul(&app)
}

#[tauri::command]
pub async fn update_agent_soul(app: AppHandle, soul: AgentSoul) -> Result<(), String> {
    write_soul(&app, &soul)
}

#[tauri::command]
pub async fn get_agent_memory(app: AppHandle) -> Result<AgentMemory, String> {
    read_memory(&app)
}

#[tauri::command]
pub async fn add_agent_memory(app: AppHandle, fact: String) -> Result<AgentMemoryItem, String> {
    add_memory_fact(&app, fact)
}

#[tauri::command]
pub async fn remove_agent_memory(app: AppHandle, id: String) -> Result<(), String> {
    remove_memory_fact(&app, &id)
}
