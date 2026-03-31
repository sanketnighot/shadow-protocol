//! Compact block for agent system prompt (installed integrations).

use crate::services::ai_kernel;

pub fn prompt_block() -> String {
    ai_kernel::render_capability_block(&ai_kernel::collect_app_capabilities())
}
