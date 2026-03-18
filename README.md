<div align="center">

<img src="src-tauri/icons/shadow.png" width="160" height="160" alt="SHADOW Protocol Logo">

# SHADOW Protocol
### *Secure Hybrid Autonomous DeFi Operations Workstation*

[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202.0-24C8DB?style=for-the-badge&logo=tauri)](https://tauri.app/)
[![Powered by Rust](https://img.shields.io/badge/powered%20by-Rust-000000?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
[![Runtime Bun](https://img.shields.io/badge/runtime-Bun-fbf0df?style=for-the-badge&logo=bun)](https://bun.sh/)
[![Local AI](https://img.shields.io/badge/AI-Local%20Ollama-ED333B?style=for-the-badge&logo=ollama)](https://ollama.com/)

**Privacy-first. Desktop-native. AI-driven.**  
The ultimate command center for autonomous multi-chain DeFi operations.

[Explore Docs](docs/shadow-protocol.md) · [Report Bug](https://github.com/your-repo/shadow-protocol/issues) · [Request Feature](https://github.com/your-repo/shadow-protocol/issues)

</div>

---

## 🌑 Why SHADOW?

In an era of transparent blockchains and cloud-dependent AI, **SHADOW Protocol** returns control to the user. It is a desktop workstation designed for high-frequency DeFi operations, where **privacy is the default** and **autonomy is the engine.**

### The Core Pillars

<table width="100%">
  <tr>
    <td width="50%" valign="top">
      <h4>🧠 Local AI Intelligence</h4>
      <p>Analyze market sentiment and portfolio health using <b>Llama 3.2 3B</b> or <b>Qwen 2.5</b>. No API calls, no data leakage, zero latency.</p>
    </td>
    <td width="50%" valign="top">
      <h4>🛡️ Sovereign Security</h4>
      <p>Keys are locked in your <b>OS Keychain</b>. We utilize <b>Fully Homomorphic Encryption (FHE)</b> concepts to ensure your strategies remain yours alone.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h4>🌐 Multi-Chain Command</h4>
      <p>Native support for Ethereum, Base, Arbitrum, and beyond. One unified interface to rule your entire cross-chain portfolio.</p>
    </td>
    <td width="50%" valign="top">
      <h4>🤖 Background Autonomy</h4>
      <p>Powered by <b>Rust Tokio</b>, your strategies (DCA, Rebalancing, Arbitrage) run 24/7 in the system tray, even when the UI is closed.</p>
    </td>
  </tr>
</table>

---

## 🚀 Experience the Future

### Prerequisites
- **Rust Toolchain** (1.75+)
- **Bun Runtime**
- **Ollama** (Local LLM Server)
- **Alchemy API Key** (For real-time on-chain data)

### Rapid Deployment
```bash
# 1. Clone the intelligence
git clone https://github.com/your-repo/shadow-protocol.git && cd shadow-protocol

# 2. Initialize dependencies
bun install

# 3. Configure the environment
cp .env.example .env # Set your ALCHEMY_API_KEY

# 4. Ignite the workstation
bun run tauri:dev
```

---

## 🏗️ Technical Architecture

SHADOW is built with a **Hybrid Edge Computing** model:

- **Frontend**: A high-performance "Glassmorphic" UI built with **React 19**, **Tailwind CSS 4**, and **Framer Motion**.
- **Backend**: A multi-threaded **Rust** core managing secure key storage, transaction signing, and background task scheduling.
- **Inference Layer**: Direct integration with **Ollama** for private, on-device intelligence.
- **Storage**: Encrypted **SQLite** via `local_db` service for transaction history and strategy metadata.

---

## 🔐 Security Framework

| Feature | Implementation |
| :--- | :--- |
| **Key Storage** | AES-256 Encrypted in OS Secure Enclave (macOS Keychain/Windows Cred Manager) |
| **Transaction Signing** | In-memory only; deterministic destruction after broadcast |
| **Network Privacy** | Built-in RPC obfuscation and stealth address support (Planned) |
| **AI Privacy** | 100% Local Inference; financial prompts never leave the local network |

---

## 🗺️ The Roadmap to Autonomy

- [x] **Phase 1: Genesis** - Multi-chain portfolio tracking & secure wallet management.
- [x] **Phase 2: Intelligence** - Local AI Agent integration for risk analysis & trade suggestions.
- [x] **Phase 3: Onboarding** - Immersive "Eclipse" initialization sequence.
- [ ] **Phase 4: Autonomy** - Background DCA and Automated Portfolio Rebalancing.
- [ ] **Phase 5: Ecosystem** - Strategy Marketplace & Tauri-powered Mobile Support.

---

## 🤝 Join the Protocol

We are building a future where finance is private and automated. See [CLAUDE.md](CLAUDE.md) for our engineering standards and [AGENTS.md](AGENTS.md) for how to contribute with AI assistance.

---

<div align="center">
  <p><i>"The shadows are where the real moves are made."</i></p>
  <img src="public/tauri.svg" width="30" height="30" alt="Tauri">
  <img src="public/vite.svg" width="30" height="30" alt="Vite">
</div>
