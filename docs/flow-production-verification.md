# Flow integration — verification matrix

Run after Flow-related changes:

| Layer | Command |
|-------|---------|
| Frontend | `bun run build`, `bun run test:run` |
| Apps runtime | `cd apps-runtime && bun run typecheck` |
| Rust | `cd src-tauri && cargo check`, `cargo clippy -- -D warnings`, `cargo test` |

## Acceptance checks (manual)

- Cadence testnet/mainnet balances appear when Flow app is installed, runtime healthy, and saved network matches.
- Multi-wallet portfolio includes 16-hex Cadence addresses alongside `0x` EVM wallets.
- `FLOW` / `FLOW-TEST` rows use Cadence explorers; `FLOW-EVM` / `FLOW-EVM-TEST` use Flow EVM explorers.
- Flow app settings save invalidates portfolio balances query.
- Read-only Flow sidecar calls do not receive session key material; `prepare_sponsored` still requires unlock.
