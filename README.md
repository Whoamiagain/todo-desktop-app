# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Environment and signing keys

Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These Vite values are bundled into the client; protect the database with Supabase row-level security rather than treating the anon key as a server secret.

The updater public key belongs in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`. It does not need a `VITE_` variable because the frontend does not read it.

Never put the updater private key in `.env`, the frontend, or the repository. For a release build on Windows PowerShell, set it only for the build process:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content .moresecrets -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your-key-password"
npm run tauri build
```

`.moresecrets` should contain the raw private-key file contents, including its first `untrusted comment: ...` line and the following `RW...` line. Do not paste a base64-encoded version of the file, add a `tauri secret key:` label, or add quotes. The private key currently in this workspace has been exposed and must be replaced with a newly generated key pair before publishing; update `plugins.updater.pubkey` with the new public key.
