//! Bundled first-party apps: registry, SQLite state, sidecar runtime, protocol adapters.

pub mod filecoin;
pub mod flow;
pub mod integration_prompt;
pub mod payload;
pub mod lit;
pub mod permissions;
pub mod registry;
pub mod runtime;
pub mod scheduler;
pub mod state;

pub use integration_prompt::prompt_block;
pub use payload::backup_payload_from_scope;
