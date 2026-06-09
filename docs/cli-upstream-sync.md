# CLI Upstream Sync

The Electron app vendors `ReagentX/imessage-exporter` in `exporter-cli`. Upstream does not provide the app-specific contact/group picker protocol, so this repo keeps a small patch series that is replayed after each upstream refresh.

## One-command sync

From the repo root:

```bash
./sync-cli latest
```

On Windows:

```powershell
.\sync-cli.ps1 latest
```

Use an explicit upstream tag when you want a pinned update:

```bash
./sync-cli 4.1.0
```

The sync command:

- clones the requested upstream tag into a temp directory
- replaces `exporter-cli` with that clean upstream tree
- writes `exporter-cli/.standalone-upstream.json`
- applies `scripts/cli-sync/patches/*.patch`
- regenerates `Cargo.lock`
- runs `node scripts/check-cli-contract.mjs`

If a patch does not apply, the command leaves `.rej` files in `exporter-cli`. Resolve them, delete the `.rej` files, then run:

```bash
node scripts/check-cli-contract.mjs
cd exporter-cli && cargo test -p imessage-exporter
```

## Required Electron CLI contract

The Electron app depends on these fork-only CLI behaviors:

- `--list-contacts` prints machine-readable chat rows:
  - `CONTACT|contact_id|message_count|first_date|last_date|chat_ids|display_name`
  - `GROUP|name|message_count|first_date|last_date|participants|chat_ids`
- GUI exports pass list-contact `chat_ids` back to the CLI via `--chat-ids`, so selected rows export by exact `chat.ROWID` instead of re-matching names or phone numbers
- export progress emits stdout lines prefixed with `PROGRESS_JSON: `
- `--images-only` skips videos/audio while keeping image-like attachments
- no-match filtered exports emit `No chatrooms were found with the supplied contacts.`

Run the contract check any time CLI code changes:

```bash
node scripts/check-cli-contract.mjs
```

## Refreshing the patch after a successful port

After manually resolving an upstream sync and confirming the app contract still works, regenerate the patch from the synced upstream tag recorded in `exporter-cli/.standalone-upstream.json`:

```bash
node scripts/cli-sync/create-electron-contract-patch.mjs
```

If you intentionally need to compare against a different upstream tag, pass that tag with `--force`.

Commit the updated `exporter-cli`, metadata file, and refreshed patch together. The next upstream update will replay that patch against the new tag.
