# Copilot Instructions — SHADOW Protocol

## Project

Tauri 2.0 desktop DeFi app. Rust backend (`src-tauri/`) + React 19/TypeScript frontend (`src/`). Package manager: bun.

## Security (Mandatory)

- This handles private keys and real funds — treat every code suggestion as security-critical
- No `.unwrap()` in Rust on external data — use `Result` and `?`
- No `any` in TypeScript — strict mode enforced
- No dynamic code evaluation, no unsanitized HTML rendering
- No hardcoded secrets, RPC URLs, or API keys
- Private keys only in OS keychain — never in files, logs, or browser storage
- Validate all inputs on the Rust side of Tauri commands
- Use checked arithmetic for all blockchain amounts

## Code Patterns

### Rust
- `#[tauri::command]` returns `Result<T, String>` — register in `generate_handler![]`
- `thiserror` for error types, `serde` for IPC serialization, `tokio` for async
- Background tasks use Tokio + `CancellationToken`, emit events to frontend

### TypeScript
- `invoke` from `@tauri-apps/api/core` for all backend calls — typed interfaces required
- Functional React components, Zustand stores, TanStack Query for server state
- `const` over `let`, never `var`
- Dark theme, shadcn/ui, TailwindCSS, Framer Motion

## What Not to Suggest

- Electron patterns (this is Tauri, not Electron)
- npm/yarn commands (use bun)
- Cloud API calls for sensitive operations (everything runs locally)
- Browser-based crypto (all crypto in Rust)
