## SHADOW Protocol

Detailed product and technical reference for the current codebase.

---

## Executive Summary

SHADOW Protocol is a **privacy-first desktop DeFi workstation** built with:

- **React 19 + TypeScript + Vite** on the frontend
- **Tauri 2 + Rust** on the backend
- **Ollama** for local model workflows
- **SQLite** for local persistence
- **OS keychain + biometric unlock** for secret handling

The core product direction is consistent across the repo:

- keep sensitive operations local
- make agent behavior visible and reviewable
- use Rust for wallet/session/security-critical work
- provide portfolio, strategy, automation, and integration surfaces in one desktop UI

The codebase already contains real functionality, but some roadmap ideas remain partial or aspirational. This document intentionally separates those areas.

---

## What The Project Solves

SHADOW is meant to reduce the operational burden of DeFi without giving up privacy or user control.

### Main problems it addresses

- fragmented portfolio management across chains and wallets
- poor UX for reviewing agent-driven financial actions
- too much sensitive logic living in browser-only environments
- manual monitoring of portfolio health, opportunities, and automation tasks
- lack of a local-first interface for AI-assisted DeFi workflows

### Intended users

- privacy-conscious DeFi users
- active portfolio managers and traders
- users who want AI assistance without hidden execution
- advanced users experimenting with guarded automation

---

## Product Reality

### Implemented

- secure wallet creation/import/list/remove flows
- OS keychain storage for private keys
- biometric-backed unlock path where platform/build conditions allow it
- in-memory session caching with expiry and clear-on-exit behavior
- portfolio balances, history, allocation, transactions, and NFT retrieval
- wallet sync pipeline with progress and completion events
- market opportunities fetch/refresh/detail flows
- local model management via Ollama
- agent chat with tool execution and approval requests
- strategy draft creation, update, simulation, and management commands
- apps/integrations registry plus Lit, Flow, and Filecoin runtime paths
- autonomous dashboard with guardrails, health, tasks, and orchestrator state
- real EVM transfer execution

### In Progress / Partial

- swap preview and approval-oriented flows
- bridge UX
- autonomous execution after task approval
- some health/orchestrator reasoning paths
- deeper strategy execution loops

### Planned / Not Yet Fully Backed By Code

- full end-to-end DeFi swap execution across all surfaced flows
- broad cross-chain execution beyond current supported paths
- complete background autonomy that can be trusted as production-ready
- richer marketplace/ecosystem behavior

---

## Supported Chains And Capability Notes

Current code-backed support is narrower than some earlier marketing text.

### Strongest supported paths

- Ethereum
- Base
- Polygon
- configured EVM testnets such as `eth-sepolia`, `base-sepolia`, `polygon-amoy`

### Additional integration paths

- Flow support exists through the apps runtime and related Rust services
- Lit and Filecoin exist as integration/app surfaces rather than core portfolio chains

### Important caveats

- transfers are real
- swaps are not yet fully end-to-end live in the same way as transfers
- bridge flows are not fully wired
- some mock/demo copy still references broader chain coverage than the backend currently guarantees

---

## System Architecture

SHADOW is organized as a layered desktop application:

```text
Frontend UI (src/)
  -> routes, components, hooks, stores, typed invoke helpers

Tauri command layer (src-tauri/src/commands/)
  -> thin IPC surface, argument validation, command registration

Rust service layer (src-tauri/src/services/)
  -> wallet, session, market, portfolio, strategy, agent, apps, autonomous logic

Apps sidecar (apps-runtime/)
  -> Bun-based isolated adapters for Lit / Flow / Filecoin
```

### Frontend architecture

The frontend is a single-shell desktop UI with feature modules.

#### Main areas

- `src/routes.tsx`: route registration using `createHashRouter`
- `src/components/layout/AppShell.tsx`: app shell, top bar, dock, toasts, onboarding, approvals, unlock modal
- `src/components/agent/`: chat UI, thread management, approvals, result cards
- `src/components/portfolio/`: balances, actions, NFTs, transactions, filters
- `src/components/strategy/`: builder, pipeline view, simulation, inspector
- `src/components/autonomous/`: task, guardrail, health, opportunities, control surfaces
- `src/components/apps/`: marketplace and integration settings
- `src/components/settings/`: theme, model, governance, API keys, destructive reset

#### Frontend state patterns

- **Zustand** for UI/session/wallet/thread state
- **TanStack Query** for async/server-style state
- **Tauri event listeners** for push-style updates from Rust
- typed invoke wrappers in `src/lib/`

### Backend architecture

The Rust backend follows a thin-command, service-heavy pattern.

#### Command modules

Located in `src-tauri/src/commands/`:

- `wallet.rs`
- `wallet_sync.rs`
- `session.rs`
- `portfolio.rs`
- `transfer.rs`
- `chat.rs`
- `strategy.rs`
- `apps.rs`
- `market.rs`
- `settings.rs`
- `ollama_manager.rs`
- `autonomous.rs`

#### Service modules

Located in `src-tauri/src/services/`:

- wallet/session-related services
- portfolio and local database services
- market ranking/provider/service modules
- agent chat, tool router, tool registry, audit, and state
- strategy compiler, validator, engine, scheduler, and legacy compatibility
- autonomous orchestration, guardrails, health, tasks, and behavior learning
- apps runtime, registry, provider-specific integration logic

#### Sidecar runtime

`apps-runtime/` is used for isolated integration adapters. Rust spawns a Bun process per request, exchanges JSON over stdin/stdout, and exits. This helps keep external SDK complexity out of the React app and out of long-lived Rust process state where not needed.

---

## Security Model

This is a security-sensitive application. The project rules correctly treat documentation claims as secondary to actual code behavior.

### Wallet and key handling

- private keys are stored in OS-backed secure storage
- wallet addresses are stored separately in an app data JSON file
- unlock happens through Rust commands, not through the frontend directly
- unlocked keys are cached only in RAM for a bounded session window
- session cache is cleared on explicit lock and on exit

### Frontend security posture

- frontend uses Tauri `invoke`, not localhost backend calls
- sensitive state is intended to stay Rust-side
- UI state is separated from backend-owned sensitive state
- approvals are explicit and surfaced in the UI

### Backend security posture

- Rust owns wallet/session logic
- service layer handles portfolio, execution, and tool routing logic
- `zeroize` is used for in-memory key material
- project rules require validation at command boundaries

### Important reality check

The codebase is security-minded, but not every roadmap idea is production-complete yet. In particular, full automation and full swap execution should not be described as already finished.

---

## Feature Areas

## 1. Wallets And Sessions

### Implemented

- create wallet from mnemonic
- import mnemonic
- import raw private key
- list and remove wallets
- keychain-backed private key storage
- biometric storage path where available
- session unlock, lock, and status commands

### Current UX behavior

- React checks session state for the active wallet
- if locked, the unlock dialog is shown
- unlocking routes through Rust and may use biometry or keychain fallback
- the active session is tracked in the frontend only as UI state, not as secret material

## 2. Portfolio

### Implemented

- balances
- multi-wallet balances
- history
- allocation summaries
- NFTs
- transactions
- wallet attribution
- portfolio sync notifications

### Data sources

- Alchemy-backed EVM portfolio fetching
- local SQLite cache
- Flow integration path where relevant

### Caveats

- mock/demo data still exists for some UI shaping
- chain labels in demo data may be broader than real backend support

## 3. Agent

### Implemented

- agent threads and message history
- local model selection
- tool result rendering
- approval request rendering
- execution log retrieval
- agent soul/persona and memory storage

### How it works

- frontend sends chat input via Tauri invoke
- Rust `chat_agent` runs agent orchestration
- agent may call tools via the tool router
- if a tool requires approval, an approval record is stored and returned
- user approval/rejection is sent back through dedicated commands

### Caveats

- not every surfaced tool path is fully wired to real on-chain execution
- some flows stop at preview/approval rather than live execution

## 4. Strategies And Automation

### Implemented

- strategy drafts
- compile/create/update/get flows
- simulation commands
- strategy management and status changes
- automation center UI
- pipeline-oriented builder UI

### Caveats

- strategy execution is not yet uniformly production-complete across all scenarios
- parts of the engine are still approval-preview oriented

## 5. Autonomous Subsystem

### Implemented

- guardrail get/set
- kill switch
- pending tasks
- approve/reject task flows
- task reasoning
- portfolio health access
- orchestrator state
- opportunity surfacing
- autonomous dashboard UI

### Caveats

- approval does not always mean full end-to-end execution is complete afterward
- some health and orchestrator inputs remain placeholder-like or simplified

## 6. Apps And Integrations

### Implemented

- apps marketplace surface
- install/uninstall/enable/config flows
- runtime health checks
- sidecar runtime dispatch
- Lit, Flow, and Filecoin provider paths

### Architectural intent

- keep external SDKs out of core React app logic
- isolate risky or heavy adapter code in a short-lived sidecar process

---

## Data And Persistence

### Frontend persistence

- UI and preference state in Zustand persistence for non-secret settings
- selected wallet names and some UX preferences persisted client-side

### Backend persistence

- SQLite database in app data directory
- wallet address list in `wallets.json`
- secrets in keychain, not app-level browser storage

### Environment/config

- `.env.example` currently documents `ALCHEMY_API_KEY`
- additional keys can be managed through the in-app Settings page

---

## Build And Tooling

### Frontend

- Vite
- strict TypeScript
- Vitest + Testing Library
- Tailwind CSS 4
- shadcn/ui configuration in `components.json`

### Backend

- Cargo-managed Rust crate under `src-tauri/`
- Tauri config in `src-tauri/tauri.conf.json`
- app resources include `apps-runtime/`

### Standard commands

```bash
bun run dev
bun run tauri:dev
bun run build
bun run test:run

cd src-tauri && cargo check
cd src-tauri && cargo clippy -- -D warnings
cd src-tauri && cargo test
```

---

## Documentation Rules Going Forward

To keep this repo trustworthy:

- do not describe a flow as live if it stops at preview, approval, or toast-only UX
- do not claim chain support that is not backed by Rust services or stable integration paths
- clearly mark roadmap features as planned
- prefer code-backed descriptions over pitch-deck language

---

## Related Docs

- `README.md`
- `docs/ui-ux.md`
- `AGENTS.md`
- `CLAUDE.md`

