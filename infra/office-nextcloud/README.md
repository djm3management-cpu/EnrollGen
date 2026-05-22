# EnrollGen Office Nextcloud Sync

This folder runs a local office-PC stack:

- Nextcloud on `http://localhost:8080`
- MariaDB for Nextcloud data
- A lightweight Python sync container that polls Supabase every 5 minutes and uploads call artifacts to Nextcloud over WebDAV

It does not touch Supabase Edge Functions, the EnrollGen post-call pipeline, or the app UI.

## File Layout

The sync service writes:

- `/EnrollGen/Summaries/{YYYY-MM}/{agent_name}_{contact_name}_{call_id}.pdf`
- `/EnrollGen/Transcripts/{YYYY-MM}/{agent_name}_{contact_name}_{call_id}.txt`

The service creates missing WebDAV folders with `MKCOL`.

## Setup On The Office PC

1. Install Docker Desktop.

2. Copy the env template:

   ```powershell
   cd C:\Users\Michael\EnrollGen\infra\office-nextcloud
   Copy-Item .env.example .env
   ```

3. Edit `.env`:

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `NEXTCLOUD_USER`
   - `NEXTCLOUD_APP_TOKEN`
   - `DB_PASSWORD`
   - `SUPABASE_SUMMARY_BUCKET` / `SUPABASE_TRANSCRIPT_BUCKET`
   - path field lists if your production metadata uses different names

   On first boot, `NEXTCLOUD_APP_TOKEN` is also used as the initial Nextcloud admin password. After Nextcloud is running, create a real app password in Nextcloud and replace `NEXTCLOUD_APP_TOKEN` with that value.

4. Start the stack:

   ```powershell
   docker compose up -d --build
   ```

5. Open `http://localhost:8080` on the office PC and log in with `NEXTCLOUD_USER` and the initial password from `NEXTCLOUD_APP_TOKEN`.

6. Create a Nextcloud app password:

   `Profile menu -> Personal settings -> Security -> Devices & sessions -> Create new app password`

   Put the generated app password into `.env` as `NEXTCLOUD_APP_TOKEN`, then restart the sync container:

   ```powershell
   docker compose up -d sync
   ```

7. View logs:

   ```powershell
   docker compose logs -f sync
   Get-Content .\logs\sync.log -Wait
   ```

## Supabase Artifact Fields

The sync container queries `call_records` using `SUPABASE_CALL_SELECT=*`. It looks for summary and transcript storage paths in these configurable fields:

- `SUPABASE_SUMMARY_PATH_FIELDS`
- `SUPABASE_TRANSCRIPT_PATH_FIELDS`

Each field can point to a plain column such as `summary_pdf_path` or a JSON metadata path such as `metadata.summary_pdf_path`.

Accepted storage path formats:

- `path/in/bucket/file.pdf`
- `bucket/path/in/bucket/file.pdf`
- `bucket:path/in/bucket/file.pdf`
- `{ "bucket": "call-summaries", "path": "path/file.pdf" }`
- Supabase object URL or signed URL

If no transcript storage path exists, the service can write a `.txt` file from `SUPABASE_TRANSCRIPT_TEXT_FIELDS`, defaulting to `transcript_raw` and common metadata paths.

By default, `ADVANCE_ON_MISSING_ARTIFACTS=false`, so a call record is retried on the next run if the expected PDF or transcript is not available yet. This avoids marking a call synced before Supabase storage finishes writing artifacts.

## Tailscale Remote Access

Do not port-forward `8080` on the router and do not expose this Nextcloud instance to the public internet.

On the office PC:

1. Install Tailscale for Windows from the official Tailscale download page: https://tailscale.com/download/windows
2. Sign in to the same tailnet you will use at home.
3. Get the office PC Tailscale IP:

   ```powershell
   tailscale ip -4
   ```

4. Add that IP to `.env`:

   ```text
   NEXTCLOUD_TRUSTED_DOMAINS=localhost 127.0.0.1 100.x.y.z
   ```

5. Restart Nextcloud:

   ```powershell
   docker compose up -d nextcloud
   ```

From your home PC, after signing in to Tailscale, Nextcloud should be reachable at:

```text
http://<office-pc-tailscale-ip>:8080
```

Tailscale's official Windows install guide is here: https://tailscale.com/docs/install/windows

## Home PC Nextcloud Desktop Client

1. Install the Nextcloud Desktop client from the official Nextcloud download page: https://nextcloud.com/install/
2. Install Tailscale on the home PC and sign in to the same tailnet.
3. In the Nextcloud Desktop client, use this server URL:

   ```text
   http://<office-pc-tailscale-ip>:8080
   ```

4. Log in with the Nextcloud user and an app password.
5. Select the `EnrollGen` folder to sync locally.

Nextcloud's desktop client install docs are here: https://docs.nextcloud.com/server/latest/user_manual/en/desktop/installation.html

## Useful Commands

```powershell
docker compose ps
docker compose logs -f nextcloud
docker compose logs -f sync
docker compose restart sync
docker compose down
```

To wipe the office Nextcloud data and start over, remove the named volumes explicitly:

```powershell
docker compose down -v
```

Only do that before production use or after exporting any needed files.
