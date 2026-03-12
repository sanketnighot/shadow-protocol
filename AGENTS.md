# AGENTS.md

Guidelines for all AI coding agents (Claude Code, Cursor, Copilot, etc.) working in this repository.

## Project Context

SHADOW Protocol — a privacy-first DeFi automation desktop app. Tauri 2.0 (Rust backend + React/TypeScript frontend). This is a **security-critical financial application** where private keys and user strategies must never be exposed.

## Security Rules (Non-Negotiable)

### Private Key Handling
- Private keys, seed phrases, and mnemonics must NEVER be logged, serialized to disk outside the OS keychain, or transmitted over any network
- Key material must be zeroed from memory immediately after use (`zeroize` crate in Rust, no plaintext JS variables)
- All key storage must use the OS keychain (macOS Keychain, Windows Credential Manager) — never custom file-based storage
- Never store secrets in localStorage, sessionStorage, IndexedDB, or cookies

### Input Validation
- Validate ALL user inputs at both frontend and Rust backend boundaries
- Sanitize wallet addresses, amounts, chain IDs before any operation
- Never pass unsanitized user input to shell commands, SQL, or eval
- Validate and bound all numeric inputs (amounts, slippage, gas) to prevent overflow/underflow

### Tauri IPC Security
- Never expose Rust functions via `#[tauri::command]` that could leak system info, read arbitrary files, or execute commands
- Every Tauri command must validate its arguments on the Rust side — never trust frontend data
- Keep Tauri's CSP restrictive; do not set it to `null` in production
- Use Tauri's permission system (`capabilities`) to restrict API access per window

### Dependency Security
- Prefer well-audited, minimal-dependency crates (e.g., `ring` over `openssl`)
- Pin dependency versions in `Cargo.toml` — no wildcards
- Do not add dependencies without justification; check for known CVEs first
- Frontend: prefer established packages with active maintenance

### Transaction Safety
- All blockchain transactions must be simulated before execution
- Enforce user-defined spending limits and guardrails at the Rust layer
- Require explicit user approval for transactions above configurable thresholds
- Implement kill switches for background automation strategies

## Code Quality Rules

### Rust (src-tauri/)
- Use `Result<T, E>` for all fallible operations — no `.unwrap()` in production code (`.expect()` only with descriptive messages for truly impossible states)
- Derive `serde::Serialize` and `serde::Deserialize` for all types crossing the IPC boundary
- Use `thiserror` for custom error types; map errors to user-friendly messages at the command level
- All async operations must use Tokio; never block the main thread
- Run `cargo clippy` — treat warnings as errors
- Use `#[cfg(test)]` modules in the same file for unit tests

### TypeScript (src/)
- Strict mode is enforced — no `any` types; use proper generics or `unknown` with type guards
- No unused variables or parameters (tsconfig enforces this)
- Use `invoke` from `@tauri-apps/api/core` for all backend calls — never fetch localhost
- All Tauri invoke calls must have typed request/response interfaces matching the Rust side
- Prefer `const` over `let`; never use `var`

### General
- No console.log/println in committed code — use structured logging (tracing in Rust, a logging utility in TS)
- No hardcoded RPC URLs, chain IDs, or contract addresses — use configuration
- No commented-out code blocks; delete unused code
- Error messages must never expose internal state, file paths, or stack traces to the user

## Architecture Patterns

### Frontend → Backend Communication
```
React Component → invoke("command_name", { args }) → #[tauri::command] fn → Result<T, E>
```
- Define shared types in a `types/` directory on the TS side
- Mirror types between Rust structs and TypeScript interfaces manually (or use `ts-rs` for generation)

### State Management
- Rust owns all sensitive state (keys, balances, active strategies)
- Frontend state (UI-only) uses Zustand stores
- Server/async state (RPC data, prices) uses TanStack Query with appropriate stale times
- Never cache sensitive data on the frontend

### Background Tasks
- Long-running automation runs in Tokio tasks on the Rust side
- Frontend receives updates via Tauri events (`emit`/`listen`), not polling
- Every background task must be cancellable and respect user-defined guardrails

## File Organization

```
src/                    # React frontend
  components/           # UI components (shadcn/ui based)
  hooks/                # Custom React hooks
  stores/               # Zustand stores
  types/                # TypeScript type definitions
  lib/                  # Utilities and helpers
src-tauri/
  src/
    lib.rs              # Tauri command definitions and app setup
    main.rs             # Entry point (calls shadow_protocol_lib::run)
    commands/           # Command modules (wallet, strategy, ai, etc.)
    services/           # Business logic (chain manager, AI engine, scheduler)
    models/             # Rust data structures
```

## Build & Dev

- Package manager: **bun** (not npm/yarn)
- `bun run tauri:dev` — full app with hot reload
- `bun run dev` — frontend only
- `cargo check` / `cargo clippy` from `src-tauri/` for Rust validation
- `cargo test` from `src-tauri/` for Rust tests

## Learned User Preferences

- Keep responses very concise with short bullet summaries by default
- Work directly in this workspace; do not use worktrees for implementation
- Keep the UI minimal with only required elements; avoid crowded or overwhelming layouts
- When fixing bugs or layout issues, find the root cause and prefer shared layout/system fixes over page-by-page patches
- Portfolio balances use Alchemy API (ALCHEMY_API_KEY in .env); not Covalent
- Theme control lives only in Settings; not in sidebar
- Cmd+K command palette should be fixed at top, not vertically centered

## Learned Workspace Facts

- Primary app navigation now lives in the bottom dock instead of the sidebar
- Supported chains: Ethereum, Base, Polygon (mainnet + testnet); no Arbitrum or Solana
- Polygon Amoy native token ticker is POL (not MATIC)
- Testnets: eth-sepolia, base-sepolia, polygon-amoy (Alchemy network names)
- Tauri: frontend in root `src/`; Rust and config in `src-tauri/`

## Design System

- Dark theme primary, purple accent (#8b5cf6)
- Fonts: Inter (UI), JetBrains Mono (numbers, addresses, code)
- Use shadcn/ui components; follow patterns in `docs/ui-ux.md`
- Privacy indicators: purple glow when enabled, gray when off
- Skeleton loaders over spinners; smooth count-up animations for balances
