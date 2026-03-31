<div align="center">

<img src="src-tauri/icons/shadow.png" width="160" height="160" alt="SHADOW Protocol logo">

# SHADOW Protocol
### Privacy-first desktop workstation for DeFi operations

[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%202.0-24C8DB?style=for-the-badge&logo=tauri)](https://tauri.app/)
[![Powered by Rust](https://img.shields.io/badge/Powered%20by-Rust-000000?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
[![Frontend React](https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=for-the-badge&logo=react&logoColor=000)](https://react.dev/)
[![Runtime Bun](https://img.shields.io/badge/Runtime-Bun-fbf0df?style=for-the-badge&logo=bun)](https://bun.sh/)
[![Local AI Ollama](https://img.shields.io/badge/Local%20AI-Ollama-111111?style=for-the-badge&logo=ollama)](https://ollama.com/)

**Secure wallet handling. Local-first AI workflows. Human-in-the-loop approvals.**
SHADOW is a desktop-native control center for monitoring portfolios, coordinating DeFi actions, drafting strategies, and exploring automation without moving sensitive logic into the browser.

[Product Docs](docs/shadow-protocol.md) · [UI/UX Docs](docs/ui-ux.md) · [Agent Rules](AGENTS.md) · [Check Demo](https://youtu.be/4fKRV4tZUzU)

</div>

---

## What SHADOW Is

SHADOW Protocol is a **Tauri 2 desktop app** with a **React + TypeScript frontend** and a **Rust backend**. It is built around a simple principle:

> sensitive state belongs on the local machine, approvals should stay explicit, and automation should never feel opaque.

Today, the project is strongest as a:

- secure local wallet and session layer
- cross-wallet portfolio dashboard
- local-AI-assisted agent workspace
- strategy builder and automation control surface
- integrations shell for Lit, Flow, and Filecoin workflows

It is **not** yet a fully autonomous, fully on-chain execution engine for every DeFi action described in the long-term vision.

---

## Why It Exists

Most DeFi workflows still force users into one or more bad trade-offs:

- sensitive wallet and strategy context leaking into browser-first or cloud-first tools
- fragmented portfolio management across chains and apps
- manual monitoring of opportunities, risk, and execution timing
- automation that is either too weak, too opaque, or too risky

SHADOW aims to solve that by combining:

- **local security primitives** for key custody and session unlock
- **desktop-native UX** for richer control flows than browser popups
- **agent-driven assistance** backed by explicit approval checkpoints
- **modular Rust services** for portfolio, market, strategy, and app integrations

---

## Current Status

The codebase already supports meaningful workflows, but some areas are still preview-only or partially wired.

### Implemented

- wallet creation, import, listing, and removal
- OS keychain storage for private keys
- biometric-backed unlock flow where supported
- in-memory session cache with expiry and clear-on-exit behavior
- portfolio balances, history, allocations, NFTs, and transactions
- multi-wallet portfolio sync with progress events
- market opportunities feed and refresh pipeline
- agent chat, tool routing, approvals, and execution logs
- Ollama status checks, install/start flows, and model management
- strategy drafting, validation, simulation, and management commands
- apps/integrations surfaces for Lit, Flow, and Filecoin adapters
- autonomous dashboard, guardrails, task queue, and orchestrator controls
- real EVM transfer flow

### In Progress / Partial

- swap flows
- bridge flows
- autonomous execution after approval
- some health/orchestrator analysis paths
- strategy execution beyond approval-preview style flows

### Planned

- deeper end-to-end DeFi execution support
- more complete autonomous execution loops
- broader chain and integration coverage
- stronger production packaging and release workflows

---

## Core Product Areas

### 1. Wallet Security

- private keys stay in OS-backed secure storage
- wallet addresses are stored separately as a non-secret list
- unlock is handled through Rust, not the React layer
- unlocked keys are cached in memory only for a limited session window

### 2. Portfolio Operations

- unified balances across supported wallets
- history, allocations, and wallet attribution
- token/NFT/transaction views
- live wallet sync feedback and confirmation notifications

### 3. Agent Workspace

- conversational interface for DeFi guidance and tool-assisted actions
- local model selection through Ollama
- structured tool results, decision cards, and inline approvals
- persisted approval flow instead of hidden background execution

### 4. Strategy and Automation

- strategy builder with pipeline-oriented UX
- strategy simulation and execution history surfaces
- automation center for managing saved strategies
- autonomous dashboard for tasks, opportunities, health, and guardrails

### 5. Apps and Integrations

- marketplace-style app surface
- sidecar runtime for integration adapters
- Lit, Flow, and Filecoin support paths
- configuration, secrets, and health/status checks

---

## Architecture At A Glance

```text
React UI (src/)
  -> Zustand stores + TanStack Query + Tauri event listeners
  -> invoke(...)
Rust Tauri commands (src-tauri/src/commands/)
  -> service layer (src-tauri/src/services/)
  -> local storage / wallet / AI / integrations / execution logic
Optional apps sidecar (apps-runtime/)
  -> Bun-powered isolated adapters for Lit / Flow / Filecoin
```

### Frontend

- React 19
- TypeScript
- Vite 7
- Tailwind CSS 4
- Framer Motion
- Zustand
- TanStack Query
- shadcn/ui

### Backend

- Rust
- Tauri 2
- Tokio
- Reqwest
- Rusqlite
- Ethers
- Keyring
- Zeroize
- tauri-plugin-biometry

---

## Security Model

This repository should be treated as **security-sensitive**. The current design centers around:

- **local key custody**: private keys are not persisted in browser storage
- **Rust-owned sensitive operations**: signing and session state stay backend-side
- **bounded unlock windows**: unlocked keys are cached in memory temporarily
- **explicit approvals**: user-facing approval checkpoints exist before sensitive actions
- **local-first AI posture**: Ollama-backed workflows keep sensitive context off hosted LLM APIs by default

Security conventions and contributor rules live in:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/security.mdc`

---

## Supported And Realistic Capability Notes

The codebase currently reflects the following more reliably than older marketing copy:

- strongest chain support is centered around **Ethereum, Base, Polygon**, plus configured testnets
- portfolio data is fetched through **Alchemy** for EVM wallets
- Flow support exists through the integrations/runtime path
- transfers are real
- swaps and bridges are **not yet fully end-to-end live flows**
- some UI text and mock/demo data still reference broader future coverage

If docs and code disagree, prefer the code and the deeper documentation in `docs/`.

---

## Quick Start

### Prerequisites

- Rust toolchain
- Bun
- Ollama
- an `ALCHEMY_API_KEY`

### Setup

```bash
git clone https://github.com/your-org/shadow-protocol.git
cd shadow-protocol

bun install
cp .env.example .env
# add ALCHEMY_API_KEY to .env

bun run tauri:dev
```

### Common Commands

```bash
# frontend dev
bun run dev

# full desktop app
bun run tauri:dev

# frontend build
bun run build

# frontend tests
bun run test:run

# rust checks
cd src-tauri && cargo check
cd src-tauri && cargo clippy -- -D warnings
cd src-tauri && cargo test
```

---

## Repository Structure

```text
src/                 React frontend
src-tauri/           Tauri app + Rust services and commands
apps-runtime/        Bun sidecar for integration adapters
docs/                Product and UI/UX documentation
public/              Static frontend assets
```

For a more detailed architecture walk-through, see `docs/shadow-protocol.md`.

---

## UI Philosophy

The product favors a compact desktop-native operator experience:

- dark-first visual language with a purple accent
- fixed top utility bar and bottom dock navigation
- explicit approval surfaces instead of surprise execution
- compact cards and dense information layouts
- local control over theme, model choice, and wallet/session state

Design details live in `docs/ui-ux.md`.

---

## Contributing

Before contributing, read:

- `AGENTS.md`
- `CLAUDE.md`
- `docs/shadow-protocol.md`

Important project conventions:

- use **`bun`**, not npm or yarn
- use Tauri `invoke`, not localhost fetch calls
- keep secrets and signing logic in Rust
- prefer shared system fixes over isolated page-specific patches
- treat documentation claims as product contracts and keep them aligned with code

---

## Roadmap Snapshot

- improve end-to-end swap and bridge execution
- deepen autonomous task execution and recovery flows
- tighten validation and test coverage around strategy and approval logic
- expand integration quality and health reporting
- keep the desktop UX compact, explicit, and trustworthy

---

<div align="center">
  <sub>SHADOW Protocol is ambitious by design, but this README now reflects the current codebase as honestly as possible.</sub>
</div>
