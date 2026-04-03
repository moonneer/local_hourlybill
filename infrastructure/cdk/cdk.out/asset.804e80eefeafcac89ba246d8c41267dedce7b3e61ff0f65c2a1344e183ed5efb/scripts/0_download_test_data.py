import argparse
import json
import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv

from env_bootstrap import apply_secrets_manager_json_env
from storage_helper import get_storage

BASE_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = Path(__file__).resolve().parent
ENV_PATH = SCRIPTS_DIR / ".env" if (SCRIPTS_DIR / ".env").exists() else BASE_DIR / ".env"

apply_secrets_manager_json_env()
load_dotenv(dotenv_path=ENV_PATH)

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
REFRESH_TOKEN = os.getenv("GOOGLE_REFRESH_TOKEN")
ACCESS_TOKEN = os.getenv("GOOGLE_ACCESS_TOKEN")
TOKEN_EXPIRES_AT = os.getenv("GOOGLE_TOKEN_EXPIRES_AT")

if not all([CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN]):
    print(
        "Missing Gmail OAuth credentials. Set HOURLYBILL_GMAIL_GEMINI_SECRET (cloud) or "
        f"configure .env at {ENV_PATH}."
    )
    raise SystemExit(1)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Download Gmail messages for a query entry in query.json."
    )
    parser.add_argument(
        "--query",
        "-q",
        required=True,
        help="Query name in query.json (top-level key).",
    )
    parser.add_argument(
        "--user-id",
        default=os.environ.get("USER_ID", ""),
        help="User ID for S3 prefix (when S3_BUCKET is set). Default: USER_ID env.",
    )
    return parser.parse_args()


def normalize_path_segment(value: str) -> str:
    return "".join(value.split())


def is_token_expired():
    if not TOKEN_EXPIRES_AT:
        return True
    try:
        expires_at = datetime.fromisoformat(TOKEN_EXPIRES_AT)
        return datetime.now(timezone.utc) >= expires_at.replace(tzinfo=timezone.utc)
    except Exception:
        return True


def refresh_access_token():
    print("Refreshing access token...")
    url = "https://oauth2.googleapis.com/token"
    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": REFRESH_TOKEN,
        "grant_type": "refresh_token",
    }
    resp = requests.post(url, data=data)
    if resp.status_code != 200:
        print(f"Failed to refresh token: {resp.text}")
        raise SystemExit(1)
    token_data = resp.json()
    new_token = token_data["access_token"]
    expires_in = token_data["expires_in"]
    new_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    new_expires_at_iso = new_expires_at.isoformat()
    global ACCESS_TOKEN, TOKEN_EXPIRES_AT
    ACCESS_TOKEN = new_token
    TOKEN_EXPIRES_AT = new_expires_at_iso
    if ENV_PATH.exists():
        try:
            lines = []
            with open(ENV_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("GOOGLE_ACCESS_TOKEN="):
                        lines.append(f"GOOGLE_ACCESS_TOKEN={new_token}\n")
                    elif line.startswith("GOOGLE_TOKEN_EXPIRES_AT="):
                        lines.append(f"GOOGLE_TOKEN_EXPIRES_AT={new_expires_at_iso}\n")
                    else:
                        lines.append(line)
            with open(ENV_PATH, "w", encoding="utf-8") as f:
                f.writelines(lines)
            print("Access token refreshed and .env updated.")
        except OSError as exc:
            print(f"Access token refreshed (in-memory only; could not write .env: {exc}).")
    else:
        print("Access token refreshed (in-memory only; no .env in container).")


def ensure_access_token():
    if is_token_expired() or not ACCESS_TOKEN:
        refresh_access_token()


def load_query_params(storage, query_name):
    try:
        params = storage.read_json("query.json")
    except FileNotFoundError as e:
        print(f"Missing query file: {e}")
        raise SystemExit(1)
    if query_name not in params:
        print(f"Query name '{query_name}' not found in query.json.")
        raise SystemExit(1)
    query = params[query_name]
    required_fields = ["client_name", "emails", "keywords", "start", "end"]
    missing = [field for field in required_fields if field not in query]
    if missing:
        print(f"Query '{query_name}' is missing fields: {', '.join(missing)}")
        raise SystemExit(1)
    if not isinstance(query["emails"], list):
        print("Query 'emails' must be a list of strings.")
        raise SystemExit(1)
    if not isinstance(query["keywords"], list):
        print("Query 'keywords' must be a list of strings.")
        raise SystemExit(1)
    if "exclude_keywords" in query and not isinstance(query["exclude_keywords"], list):
        print("Query 'exclude_keywords' must be a list of strings.")
        raise SystemExit(1)
    return query


def parse_date(value, label):
    try:
        return datetime.fromisoformat(value).date()
    except Exception:
        print(f"Invalid {label} date '{value}'. Use ISO format like YYYY-MM-DD.")
        raise SystemExit(1)


def format_term(term: str) -> str:
    cleaned = term.strip().replace('"', "")
    if cleaned.startswith("-"):
        cleaned = cleaned.lstrip("-").strip()
    if not cleaned:
        return ""
    if " " in cleaned:
        return f"\"{cleaned}\""
    return cleaned


def build_gmail_query(emails, start, end, keywords, exclude_keywords=None):
    terms = []
    for term in (keywords or []) + (emails or []):
        if not isinstance(term, str):
            continue
        formatted = format_term(term)
        if not formatted:
            continue
        terms.append(formatted)
    if not terms:
        print("Each query must include at least one keyword or email.")
        raise SystemExit(1)
    start_date = parse_date(start, "start")
    end_date = parse_date(end, "end")
    if end_date < start_date:
        print("End date must be on or after start date.")
        raise SystemExit(1)
    start_query = (start_date - timedelta(days=1)).strftime("%Y-%m-%d")
    end_query = (end_date + timedelta(days=1)).strftime("%Y-%m-%d")
    date_part = f"after:{start_query} before:{end_query}"
    or_part = " OR ".join(terms)
    exclude_terms = []
    for term in exclude_keywords or []:
        if not isinstance(term, str):
            continue
        formatted = format_term(term)
        if not formatted:
            continue
        exclude_terms.append(f"-{formatted}")
    exclude_part = " ".join(exclude_terms)
    final_query = f"({or_part}) {date_part}{(' ' + exclude_part) if exclude_part else ''}"
    print(f"Gmail query: {final_query}")
    return final_query


def flatten_matter_keywords(matters):
    keywords = []
    if not isinstance(matters, dict):
        return keywords
    for matter_keywords in matters.values():
        if isinstance(matter_keywords, list):
            keywords.extend(matter_keywords)
    return keywords


def flatten_matter_names(matters):
    names = []
    if not isinstance(matters, dict):
        return names
    for name in matters.keys():
        if isinstance(name, str) and name.strip():
            names.append(name)
    return names


def fetch_message_ids(gmail_query):
    print("Fetching message IDs from Gmail...")
    url = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    params = {"q": gmail_query, "maxResults": 500}
    all_ids = []
    next_page_token = None
    while True:
        if next_page_token:
            params["pageToken"] = next_page_token
        resp = requests.get(url, headers=headers, params=params)
        if resp.status_code != 200:
            print(f"Failed to fetch message IDs: {resp.text}")
            raise SystemExit(1)
        data = resp.json()
        ids = [msg["id"] for msg in data.get("messages", [])]
        all_ids.extend(ids)
        next_page_token = data.get("nextPageToken")
        if not next_page_token:
            break
    print(f"Total message IDs fetched: {len(all_ids)}")
    return all_ids


def fetch_messages(message_ids):
    print("Fetching message data from Gmail...")
    url_template = "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}"
    headers = {
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    message_data = []
    start_time = time.time()
    for idx, msg_id in enumerate(message_ids, 1):
        url = url_template.format(msg_id)
        try:
            resp = requests.get(url, headers=headers, params={"format": "raw"})
            if resp.status_code != 200:
                print(f"Failed to fetch message {msg_id}: {resp.text}")
                continue
            message_data.append(resp.json())
        except Exception as e:
            print(f"Exception fetching message {msg_id}: {e}")
            continue
        if idx % 10 == 0 or idx == len(message_ids):
            print(f"Fetched {idx}/{len(message_ids)} messages...")
    elapsed = time.time() - start_time
    print(f"Total messages fetched: {len(message_data)} in {elapsed:.2f} seconds")
    return message_data


def main():
    args = parse_args()
    ensure_access_token()

    storage = get_storage(args.user_id)
    params = load_query_params(storage, args.query)
    client_name = params["client_name"]
    client_dir = normalize_path_segment(client_name)
    query_dir = normalize_path_segment(args.query)
    prefix = storage.get_client_query_prefix(client_dir, query_dir)
    base_dir = storage.get_base_dir_path(client_dir, query_dir)
    if base_dir is not None:
        base_dir.mkdir(parents=True, exist_ok=True)

    matters = params.get("matters", {}) or {}
    matter_names = flatten_matter_names(matters)
    matter_keywords = flatten_matter_keywords(matters)
    gmail_keywords = (params.get("keywords", []) or []) + matter_names + matter_keywords
    exclude_keywords = params.get("exclude_keywords", []) or []
    gmail_query = build_gmail_query(
        params["emails"], params["start"], params["end"], gmail_keywords, exclude_keywords
    )
    message_ids = fetch_message_ids(gmail_query)
    raw_messages = fetch_messages(message_ids)

    storage.write_json(prefix + "raw_messages.json", raw_messages)
    print(f"Saved {len(raw_messages)} messages to {prefix}raw_messages.json")


if __name__ == "__main__":
    main()
