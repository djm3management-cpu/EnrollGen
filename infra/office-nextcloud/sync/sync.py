#!/usr/bin/env python3
import base64
import json
import logging
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


REQUIRED_ENV = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "NEXTCLOUD_URL",
    "NEXTCLOUD_USER",
    "NEXTCLOUD_APP_TOKEN",
]


def env(name, default=""):
    return os.environ.get(name, default).strip()


def split_env_list(name, default=""):
    raw = env(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


SUPABASE_URL = env("SUPABASE_URL").rstrip("/")
SUPABASE_SERVICE_KEY = env("SUPABASE_SERVICE_KEY")
NEXTCLOUD_URL = env("NEXTCLOUD_URL").rstrip("/") + "/"
NEXTCLOUD_USER = env("NEXTCLOUD_USER")
NEXTCLOUD_APP_TOKEN = env("NEXTCLOUD_APP_TOKEN")

CALLS_TABLE = env("SUPABASE_CALLS_TABLE", "call_records")
CALL_SELECT = env("SUPABASE_CALL_SELECT", "*")
SYNC_TIME_COLUMN = env("SYNC_TIME_COLUMN", "created_at")
PAGE_SIZE = int(env("SUPABASE_PAGE_SIZE", "50") or "50")
SYNC_INTERVAL_SECONDS = int(env("SYNC_INTERVAL_SECONDS", "300") or "300")
INITIAL_SYNC_SINCE = env("INITIAL_SYNC_SINCE", "1970-01-01T00:00:00Z")
ADVANCE_ON_MISSING_ARTIFACTS = env("ADVANCE_ON_MISSING_ARTIFACTS", "false").lower() in ("1", "true", "yes")

SUMMARY_BUCKET = env("SUPABASE_SUMMARY_BUCKET", "call-summaries")
TRANSCRIPT_BUCKET = env("SUPABASE_TRANSCRIPT_BUCKET", "call-transcripts")
SUMMARY_PATH_FIELDS = split_env_list(
    "SUPABASE_SUMMARY_PATH_FIELDS",
    "summary_pdf_path,call_summary_pdf_path,pdf_storage_path,metadata.summary_pdf_path,"
    "metadata.call_summary_pdf_path,metadata.summaryPdfPath,metadata.summary_pdf.storage_path,"
    "metadata.summaryPdf.storagePath",
)
TRANSCRIPT_PATH_FIELDS = split_env_list(
    "SUPABASE_TRANSCRIPT_PATH_FIELDS",
    "transcript_storage_path,transcript_txt_path,raw_transcript_path,metadata.transcript_storage_path,"
    "metadata.transcript_txt_path,metadata.raw_transcript_path,metadata.transcript.storage_path,"
    "metadata.transcript.storagePath",
)
TRANSCRIPT_TEXT_FIELDS = split_env_list(
    "SUPABASE_TRANSCRIPT_TEXT_FIELDS",
    "transcript_raw,transcript_text,metadata.transcript_raw,metadata.transcript_text",
)

STATE_DB = env("STATE_DB", "/data/sync-state.sqlite3")
LOG_FILE = env("LOG_FILE", "/logs/sync.log")


def setup_logging():
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.FileHandler(LOG_FILE),
            logging.StreamHandler(sys.stdout),
        ],
    )


def validate_env():
    missing = [name for name in REQUIRED_ENV if not env(name)]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")


def open_state_db():
    os.makedirs(os.path.dirname(STATE_DB), exist_ok=True)
    conn = sqlite3.connect(STATE_DB)
    conn.execute("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    conn.commit()
    return conn


def get_state(conn, key, default):
    row = conn.execute("SELECT value FROM state WHERE key = ?", (key,)).fetchone()
    return row[0] if row else default


def set_state(conn, key, value):
    conn.execute(
        "INSERT INTO state(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()


def http_request(method, url, data=None, headers=None, basic_auth=None, timeout=90):
    req_headers = dict(headers or {})
    if basic_auth:
        user, password = basic_auth
        token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
        req_headers["Authorization"] = f"Basic {token}"
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.status, response.read(), dict(response.headers)


def supabase_headers():
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/json",
    }


def query_calls(since):
    params = {
        "select": CALL_SELECT,
        SYNC_TIME_COLUMN: f"gt.{since}",
        "order": f"{SYNC_TIME_COLUMN}.asc",
        "limit": str(PAGE_SIZE),
    }
    url = f"{SUPABASE_URL}/rest/v1/{urllib.parse.quote(CALLS_TABLE)}?{urllib.parse.urlencode(params)}"
    status, body, _ = http_request("GET", url, headers=supabase_headers())
    if status >= 300:
        raise RuntimeError(f"Supabase query failed with HTTP {status}")
    return json.loads(body.decode("utf-8"))


def get_nested(row, field_path):
    current = row
    for part in field_path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def first_value(row, field_paths):
    for field_path in field_paths:
        value = get_nested(row, field_path)
        if value not in (None, "", []):
            return value
    return None


def parse_storage_ref(value, default_bucket):
    if not value:
        return None
    if isinstance(value, list):
        return parse_storage_ref(value[0] if value else None, default_bucket)
    if isinstance(value, dict):
        url = value.get("url") or value.get("signed_url") or value.get("signedUrl")
        if url:
            return {"url": str(url)}
        bucket = value.get("bucket") or value.get("bucket_name") or default_bucket
        path = value.get("path") or value.get("storage_path") or value.get("storagePath") or value.get("key")
        if bucket and path:
            return {"bucket": str(bucket), "path": str(path).lstrip("/")}
        return None

    raw = str(value).strip()
    if not raw:
        return None
    if raw.startswith("http://") or raw.startswith("https://"):
        return {"url": raw}

    raw = raw.removeprefix("supabase://").lstrip("/")
    if default_bucket and raw.startswith(f"{default_bucket}/"):
        return {"bucket": default_bucket, "path": raw[len(default_bucket) + 1 :]}
    if ":" in raw and "/" not in raw.split(":", 1)[0]:
        bucket, path = raw.split(":", 1)
        return {"bucket": bucket, "path": path.lstrip("/")}
    if default_bucket:
        return {"bucket": default_bucket, "path": raw}
    if "/" in raw:
        bucket, path = raw.split("/", 1)
        return {"bucket": bucket, "path": path}
    return None


def storage_object_url(bucket, path):
    return (
        f"{SUPABASE_URL}/storage/v1/object/"
        f"{urllib.parse.quote(bucket, safe='')}/"
        f"{urllib.parse.quote(path, safe='/')}"
    )


def download_storage_ref(ref):
    if "url" in ref:
        headers = {}
        if ref["url"].startswith(SUPABASE_URL):
            headers = supabase_headers()
        status, body, _ = http_request("GET", ref["url"], headers=headers)
    else:
        status, body, _ = http_request(
            "GET",
            storage_object_url(ref["bucket"], ref["path"]),
            headers=supabase_headers(),
        )
    if status >= 300:
        raise RuntimeError(f"storage download failed with HTTP {status}")
    return body


def parse_dt(value):
    if not value:
        return datetime.now(timezone.utc)
    raw = str(value)
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def month_for_call(row):
    dt = parse_dt(row.get("call_start") or row.get(SYNC_TIME_COLUMN) or row.get("created_at"))
    return f"{dt.year:04d}-{dt.month:02d}"


def clean_part(value, fallback):
    text = str(value or "").strip() or fallback
    text = re.sub(r"[^A-Za-z0-9._ -]+", "", text)
    text = re.sub(r"\s+", "_", text).strip("._- ")
    return (text or fallback)[:80]


def contact_name(row):
    first = row.get("customer_first_name") or get_nested(row, "metadata.customer_first_name")
    last = row.get("customer_last_name") or get_nested(row, "metadata.customer_last_name")
    combined = " ".join(part for part in [first, last] if part)
    return combined or row.get("beneficiary_name") or get_nested(row, "metadata.contact_name") or "UnknownContact"


def agent_name(row):
    return row.get("agent_name") or row.get("writing_agent") or get_nested(row, "metadata.agent_name") or "UnknownAgent"


def file_stem(row):
    call_id = str(row.get("id") or "unknown-call")
    return f"{clean_part(agent_name(row), 'UnknownAgent')}_{clean_part(contact_name(row), 'UnknownContact')}_{clean_part(call_id, 'unknown-call')}"


def webdav_url(path_parts, collection=False):
    encoded = "/".join(urllib.parse.quote(str(part).strip("/"), safe="") for part in path_parts if part)
    suffix = "/" if collection else ""
    return f"{NEXTCLOUD_URL}{encoded}{suffix}"


def mkcol(path_parts):
    try:
        status, _, _ = http_request(
            "MKCOL",
            webdav_url(path_parts, collection=True),
            basic_auth=(NEXTCLOUD_USER, NEXTCLOUD_APP_TOKEN),
        )
        if status in (200, 201, 204, 405):
            return
        raise RuntimeError(f"MKCOL returned HTTP {status}")
    except urllib.error.HTTPError as error:
        if error.code == 405:
            return
        raise


def ensure_collection(path_parts):
    current = []
    for part in path_parts:
        current.append(part)
        mkcol(current)


def put_with_retry(path_parts, content, content_type):
    url = webdav_url(path_parts)
    headers = {
        "Content-Type": content_type,
        "Content-Length": str(len(content)),
    }
    last_error = None
    for attempt in range(1, 4):
        try:
            status, _, _ = http_request(
                "PUT",
                url,
                data=content,
                headers=headers,
                basic_auth=(NEXTCLOUD_USER, NEXTCLOUD_APP_TOKEN),
            )
            if status in (200, 201, 204):
                return
            raise RuntimeError(f"PUT returned HTTP {status}")
        except Exception as error:
            last_error = error
            logging.warning("Upload attempt %s failed for %s: %s", attempt, "/".join(path_parts), error)
            if attempt < 3:
                time.sleep(2)
    raise RuntimeError(f"upload failed after 3 attempts: {last_error}")


def transcript_fallback_bytes(row):
    value = first_value(row, TRANSCRIPT_TEXT_FIELDS)
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        text = json.dumps(value, indent=2, ensure_ascii=False)
    else:
        text = str(value)
    return text.encode("utf-8")


def process_call(row):
    call_id = row.get("id")
    month = month_for_call(row)
    stem = file_stem(row)
    uploaded = []
    missing = []

    ensure_collection(["EnrollGen"])
    ensure_collection(["EnrollGen", "Summaries", month])
    ensure_collection(["EnrollGen", "Transcripts", month])

    summary_ref = parse_storage_ref(first_value(row, SUMMARY_PATH_FIELDS), SUMMARY_BUCKET)
    if summary_ref:
        summary = download_storage_ref(summary_ref)
        put_with_retry(
            ["EnrollGen", "Summaries", month, f"{stem}.pdf"],
            summary,
            "application/pdf",
        )
        uploaded.append("summary")
    else:
        logging.warning("Call %s has no summary PDF storage path; skipping PDF", call_id)
        missing.append("summary")

    transcript_ref = parse_storage_ref(first_value(row, TRANSCRIPT_PATH_FIELDS), TRANSCRIPT_BUCKET)
    if transcript_ref:
        transcript = download_storage_ref(transcript_ref)
    else:
        transcript = transcript_fallback_bytes(row)
        if transcript:
            logging.warning("Call %s has no transcript storage path; using transcript text field fallback", call_id)

    if transcript:
        put_with_retry(
            ["EnrollGen", "Transcripts", month, f"{stem}.txt"],
            transcript,
            "text/plain; charset=utf-8",
        )
        uploaded.append("transcript")
    else:
        logging.warning("Call %s has no transcript storage path or text fallback; skipping transcript", call_id)
        missing.append("transcript")

    logging.info("Call %s synced artifacts: %s", call_id, ", ".join(uploaded) or "none")
    if missing and not ADVANCE_ON_MISSING_ARTIFACTS:
        raise RuntimeError(
            f"Call {call_id} missing artifact(s): {', '.join(missing)}. "
            "Not advancing last_synced."
        )


def sync_once(conn):
    since = get_state(conn, "last_synced", INITIAL_SYNC_SINCE)
    logging.info("Starting sync run from %s", since)
    rows = query_calls(since)
    logging.info("Supabase returned %s call record(s)", len(rows))

    latest_synced = since
    for row in rows:
        process_call(row)
        latest_synced = str(row.get(SYNC_TIME_COLUMN) or row.get("created_at") or latest_synced)
        set_state(conn, "last_synced", latest_synced)

    logging.info("Finished sync run; last_synced=%s", latest_synced)


def main():
    setup_logging()
    validate_env()
    conn = open_state_db()
    logging.info("EnrollGen Supabase-to-Nextcloud sync service started")

    run_once = env("RUN_ONCE", "false").lower() in ("1", "true", "yes")
    while True:
        try:
            sync_once(conn)
        except Exception:
            logging.exception("Sync run failed")
        if run_once:
            break
        time.sleep(SYNC_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
