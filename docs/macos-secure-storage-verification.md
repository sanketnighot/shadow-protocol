# macOS Secure Storage Verification

This app uses macOS Keychain and `tauri-plugin-biometry` for wallet unlock and secret storage.

## Why This Exists

Unsigned `tauri dev` builds do not reliably match production behavior for:

- biometric-protected keychain items
- keychain access prompts
- repeated authorization dialogs across runs

Use `tauri dev` for normal UI iteration, but validate wallet unlock UX in a packaged and signed macOS build before treating the behavior as production-ready.

## Recommended Validation Order

1. Verify basic flow in `bun run tauri:dev`.
2. Package a signed macOS build.
3. Test unlock behavior again in the signed build.
4. Use the signed-build result as the source of truth for biometric UX decisions.

## Signed Build Checklist

Before testing, make sure the macOS signing identity is configured for Tauri packaging in your local environment.

Suggested verification pass:

1. Build and install a signed macOS app package.
2. Launch the app with one wallet configured.
3. Lock the session and unlock it again.
4. Confirm the normal unlock path uses a single user interaction.
5. Quit and relaunch the app.
6. Confirm the app does not fan out multiple keychain/password prompts during startup.
7. Repeat with multiple wallets configured.
8. Open Settings and confirm stored API keys can be checked without a burst of duplicate prompts.

## Expected Results

- Startup should not trigger a stack of repeated keychain dialogs.
- Session unlock should allow only one unlock attempt at a time.
- When biometry-backed storage is available, unlock should complete with a single prompt.
- Any extra prompts seen only in unsigned dev mode should be treated as environment-specific, not as production UX.

## Notes For Future Development

- Wallet biometry data and keychain wallet entries must stay under the same service/domain naming.
- New startup tasks should reuse already-loaded secrets instead of reading from Keychain independently.
- If a new feature needs a keychain secret, prefer a shared cached accessor over direct `Entry::get_password()` calls.
