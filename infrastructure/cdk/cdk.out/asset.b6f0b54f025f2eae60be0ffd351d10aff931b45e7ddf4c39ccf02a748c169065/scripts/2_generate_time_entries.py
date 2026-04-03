import argparse
import json
import os
import re
from datetime import datetime, timezone
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from google import genai

from env_bootstrap import apply_secrets_manager_json_env
from storage_helper import get_storage

BASE_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = Path(__file__).resolve().parent
ENV_PATH = SCRIPTS_DIR / ".env" if (SCRIPTS_DIR / ".env").exists() else BASE_DIR / ".env"
PACIFIC_TZ = ZoneInfo("America/Los_Angeles")
FEE_PATTERN = re.compile(r"\bfees?\b", re.IGNORECASE)

apply_secrets_manager_json_env()
load_dotenv(dotenv_path=ENV_PATH)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate time entries from parsed Gmail data."
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


def get_google_api_key():
    api_key = os.getenv("GOOGLE_GENAI_API_KEY")
    if not api_key:
        raise SystemExit(f"Missing GOOGLE_GENAI_API_KEY in .env at {ENV_PATH}.")
    return api_key


def extract_email_address(value: str) -> str:
    if not value:
        return ""
    _, address = parseaddr(value)
    return (address or "").strip().lower()


def load_blocked_senders(storage) -> Set[str]:
    if not storage.file_exists("system_senders.json"):
        raise SystemExit("Missing system sender config (system_senders.json)")
    data = storage.read_json("system_senders.json")
    blocked = data.get("blocked_senders", [])
    if not isinstance(blocked, list):
        raise SystemExit("system_senders.json must include blocked_senders as a list.")
    return {extract_email_address(str(value)) for value in blocked if str(value).strip()}


def load_query_params(storage, query_name: str) -> Dict:
    try:
        params = storage.read_json("query.json")
    except FileNotFoundError as e:
        raise SystemExit(f"Missing query file: {e}")
    if query_name not in params:
        raise SystemExit(f"Query name '{query_name}' not found in query.json.")
    query = params[query_name]
    if "client_name" not in query:
        raise SystemExit(f"Query '{query_name}' is missing 'client_name'.")
    if "billing_rate" not in query:
        raise SystemExit(f"Query '{query_name}' is missing 'billing_rate'.")
    if "matters" not in query or not isinstance(query["matters"], dict):
        raise SystemExit(f"Query '{query_name}' is missing 'matters'.")
    return query


def load_inputs(storage) -> str:
    if not storage.file_exists("inputs.json"):
        raise SystemExit("Missing inputs file (inputs.json)")
    data = storage.read_json("inputs.json")
    user_name = data.get("user_name") or data.get("user")
    if not user_name:
        raise SystemExit("inputs.json must include user_name or user.")
    return user_name


def parse_email_date(email_obj: Dict) -> Optional[str]:
    header_date = (
        email_obj.get("metadata", {}).get("date")
        or email_obj.get("headers", {}).get("date", [""])[0]
    )
    if header_date:
        try:
            dt = parsedate_to_datetime(header_date)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(PACIFIC_TZ).date().isoformat()
        except Exception:
            pass
    internal_date = email_obj.get("internalDate")
    if internal_date:
        try:
            ts = int(internal_date) / 1000
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
            return dt.astimezone(PACIFIC_TZ).date().isoformat()
        except Exception:
            pass
    return None


def email_sort_timestamp(email_obj: Dict) -> int:
    internal_date = email_obj.get("internalDate")
    if internal_date:
        try:
            return int(internal_date)
        except Exception:
            pass

    header_date = (
        email_obj.get("metadata", {}).get("date")
        or email_obj.get("headers", {}).get("date", [""])[0]
    )
    if header_date:
        try:
            dt = parsedate_to_datetime(header_date)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except Exception:
            pass

    return 0


def assign_matter(text: str, matter_keywords: List[List[str]]) -> int:
    text_lower = text.lower()
    scores = []
    for keywords in matter_keywords:
        score = 0
        for keyword in keywords:
            for token in keyword.split(","):
                token = token.strip().lower()
                if token:
                    score += text_lower.count(token)
        scores.append(score)
    if not scores:
        return 0
    max_score = max(scores)
    return scores.index(max_score)


def assign_email_hours(email_obj: Dict) -> float:
    text_plain = email_obj.get("contents", {}).get("text_plain", "") or ""
    hours = 0
    if len(text_plain) > 6000:
        hours += 0.1
    if "docs.google.com/document/d/" in text_plain:
        hours += 0.5

    return round(hours, 1)


def assign_doc_hours(email_obj: Dict, attachment: Dict) -> float:
    if "SENT" in email_obj.get("labelIds", []):
        page_multiple = 0.2
    else:
        page_multiple = 0.1
    page_count = attachment.get("page_count") or 0
    return page_count * page_multiple


def collect_documents(email_obj: Dict, matter_keywords: List[List[str]]) -> List[Dict]:
    documents = []
    contents = email_obj.get("contents", {})
    text_plain = contents.get("text_plain", "") or ""
    text_html = contents.get("text_html", "") or ""
    snippet = email_obj.get("snippet", "") or ""
    email_text = text_plain.strip() or text_html.strip() or snippet.strip()
    metadata = email_obj.get("metadata", {})
    source_email_from = extract_email_address(metadata.get("from", "") or "")
    potential_expense = bool(FEE_PATTERN.search(email_text or ""))

    if email_text:
        matter_idx = assign_matter(email_text, matter_keywords)
        documents.append(
            {
                "text": email_text,
                "matter_idx": matter_idx,
                "hours": assign_email_hours(email_obj),
                "potential_expense": potential_expense,
                "doc_type": "email",
                "source_email_from": source_email_from,
                "source_email_id": email_obj.get("id"),
                "thread_id": email_obj.get("threadId"),
                "subject": metadata.get("subject"),
                "date": metadata.get("date"),
            }
        )

    for attachment in contents.get("attachments", []):
        attachment_text = (attachment.get("parsed_text") or "").strip()
        if not attachment_text:
            continue
        matter_idx = assign_matter(attachment_text, matter_keywords)
        documents.append(
            {
                "text": attachment_text,
                "matter_idx": matter_idx,
                "hours": assign_doc_hours(email_obj, attachment),
                "potential_expense": potential_expense,
                "doc_type": "attachment",
                "source_email_from": source_email_from,
                "source_email_id": email_obj.get("id"),
                "thread_id": email_obj.get("threadId"),
                "attachment_filename": attachment.get("filename"),
                "mime_type": attachment.get("mime_type"),
                "page_count": attachment.get("page_count"),
                "text_source": attachment.get("text_source"),
            }
        )

    return documents


def build_llm_prompt(
    day: str,
    matter_entries: List[Tuple[str, str, List[str]]],
    user_name: str,
    client_name: str,
    matter_keywords_map: Dict[str, List[str]],
) -> str:
    multiple_matters = len(matter_entries) > 1
    matter_lines = []
    for letter, matter_name, _ in matter_entries:
        keywords = matter_keywords_map.get(matter_name, [])
        if isinstance(keywords, list):
            keyword_text = ", ".join([str(item) for item in keywords if item])
        else:
            keyword_text = str(keywords) if keywords else ""
        matter_lines.append(f"{letter}. {matter_name}: {keyword_text}".strip())
    matter_list_text = " ".join(matter_lines)
    multiple_matters_text = " ".join(
        f"""
    The following matters are present, each with several key words in the following format
    {{Name:List, of, Keywords}}. {matter_list_text} Make sure each matter is prefixed by a letter starting from A.

    Please look for keywords relating to each matter and determine which matters were worked
    on this day. Some matters listed may not be present, only include a work description
    for matters for which work was completed.
    """.split()
    )

    query = f"""
    You are a legal billing assistant creating an invoice for {
        user_name
    }. Attached is the emails {user_name}
    received or sent relating to {client_name} on a single day.

    {multiple_matters_text if multiple_matters else ""}

    Create a one sentence description of the work completed {
        "for each matter" if multiple_matters else ""
    }
    , including the names of any documents drafted or reviewed.

    Describe tasks in a way that helps the client understand why the work was necessary.
    Use persuasive, effective verbs. For example, "Researched, wrote, and revised summary
    judgment brief" is better than "Summary judgment brief", "Researched and revised brief"
    is better than "Attended to brief", "Analyzed" is better than "Read". For meetings, calls,
    or correspondence, specify the topic of the conversation. For example, "Worked with J.
    Smith on tactical choices in appellate brief" is better than "Talked to J. Smith." These
    time entry descriptions are also a time to remind clients of successes if there have been
    successes. For example "Analyzed decision granting summary judgment and considered plaintiff's
    possible appellate remedies" is better than "Reviewed decision."

    Do not use any markdown formatting, instead use plain text responses only.

    {
        "Prefix each matter's sentence by it's letter in the input list of matters and suffix"
        + "each with the numbers corresponding to each document used in that matter each "
        + "separated by a comma and a new line character."
        + '''Use this exact format:
        <Letter corresponding to matter>
        <descriptive sentence>
        <comma separated list of numbers corresponding to documents used to generate previous sentence>

        <Letter corresponding to matter>
        <descriptive sentence>
        <comma separated list of numbers corresponding to documents used to generate previous sentence>

        ...
        '''
        if multiple_matters
        else ""
    }
    """
    query = " ".join(query.split("\n\t"))

    sections = [query, f"Date: {day}"]
    for letter, matter_name, docs in matter_entries:
        section_lines = [f"Matter {letter}: {matter_name}"]
        for i, doc in enumerate(docs, 1):
            section_lines.append(f"{letter} Document {i} Start")
            section_lines.append(doc)
            section_lines.append(f"{letter} Document {i} End")
        sections.append("\n".join(section_lines))
    return "\n\n".join(sections)


def strip_prefix(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^[\-*]\s+", "", text)
    text = re.sub(r"^[A-Za-z0-9]+\s*[\.\:\)\-]\s*", "", text)
    return text.strip()


def parse_doc_numbers(line: str) -> List[int]:
    return [int(value) for value in re.findall(r"\d+", line)]


def parse_llm_output(
    response_text: str, letters: List[str]
) -> Dict[str, Dict[str, object]]:
    lines = [line.strip() for line in response_text.splitlines() if line.strip()]
    parsed: Dict[str, Dict[str, object]] = {}
    i = 0
    while i < len(lines):
        line = lines[i]
        letter_match = re.match(r"^([A-Z])\s*[\.\:\)\-]?\s*$", line)
        if letter_match:
            letter = letter_match.group(1)
            if letter in letters and letter not in parsed:
                description = lines[i + 1] if i + 1 < len(lines) else ""
                doc_line = lines[i + 2] if i + 2 < len(lines) else ""
                parsed[letter] = {
                    "description": strip_prefix(description),
                    "doc_numbers": parse_doc_numbers(doc_line),
                }
                i += 3
                continue
        inline_match = re.match(r"^([A-Z])\s*[\.\:\)\-]\s*(.+)$", line)
        if inline_match:
            letter = inline_match.group(1)
            if letter in letters and letter not in parsed:
                description = inline_match.group(2).strip()
                doc_line = lines[i + 1] if i + 1 < len(lines) else ""
                parsed[letter] = {
                    "description": strip_prefix(description),
                    "doc_numbers": parse_doc_numbers(doc_line),
                }
                i += 2
                continue
        i += 1

    if parsed:
        return parsed

    for letter, line in zip(letters, lines):
        parsed[letter] = {"description": strip_prefix(line), "doc_numbers": []}
    return parsed


def select_documents(
    docs: List[Dict], doc_numbers: List[int]
) -> Tuple[List[int], List[Dict]]:
    max_index = len(docs)
    selected_indices: List[int] = []
    seen = set()
    for number in doc_numbers:
        if 1 <= number <= max_index and number not in seen:
            selected_indices.append(number)
            seen.add(number)
    if not selected_indices:
        selected_indices = list(range(1, max_index + 1))
    selected_docs = [docs[index - 1] for index in selected_indices]
    return selected_indices, selected_docs


def generate_descriptions(
    client: genai.Client,
    day: str,
    matter_entries: List[Tuple[str, str, List[str]]],
    user_name: str,
    client_name: str,
    matter_keywords_map: Dict[str, List[str]],
) -> Dict[str, Dict[str, object]]:
    letters = [entry[0] for entry in matter_entries]
    prompt = build_llm_prompt(
        day, matter_entries, user_name, client_name, matter_keywords_map
    )
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
    )
    response_text = response.text or ""
    return parse_llm_output(response_text, letters)


def main():
    args = parse_args()
    storage = get_storage(args.user_id)
    query = load_query_params(storage, args.query)
    user_name = load_inputs(storage)
    blocked_senders = load_blocked_senders(storage)

    client_name = query["client_name"]
    billing_rate = query["billing_rate"]
    matters = list(query["matters"].keys())
    matter_keywords_map = query["matters"]
    matter_keywords = [matter_keywords_map.get(matter, []) for matter in matters]
    if not matters:
        raise SystemExit("No matters found in query.json.")

    if len(matters) > 26:
        raise SystemExit("Too many matters for letter labeling (max 26).")

    client_dir = normalize_path_segment(client_name)
    query_dir = normalize_path_segment(args.query)
    prefix = storage.get_client_query_prefix(client_dir, query_dir)
    base_dir = storage.get_base_dir_path(client_dir, query_dir)

    if not storage.file_exists(prefix + "parsed_emails.json"):
        raise SystemExit(f"Missing parsed email data at {prefix}parsed_emails.json")

    parsed_emails = storage.read_json(prefix + "parsed_emails.json")

    if not isinstance(parsed_emails, list):
        raise SystemExit("parsed_emails.json must be a list.")

    parsed_emails.sort(key=email_sort_timestamp)

    day_map: Dict[str, Dict[int, Dict[str, object]]] = {}
    potential_expense_entries: List[Dict] = []
    seen_attachment_filenames = set()
    for email_obj in parsed_emails:
        date_str = parse_email_date(email_obj)
        if not date_str:
            continue
        docs = collect_documents(email_obj, matter_keywords)
        fee_email_doc = next(
            (
                doc
                for doc in docs
                if doc.get("doc_type") == "email" and doc.get("potential_expense")
            ),
            None,
        )
        if fee_email_doc:
            matter_idx = int(fee_email_doc.get("matter_idx") or 0)
            matter_name = matters[matter_idx] if 0 <= matter_idx < len(matters) else ""
            subject = (fee_email_doc.get("subject") or "").strip()
            description = subject or "Potential expense (fee email)."
            documents_used = []
            for index, doc in enumerate(docs, 1):
                documents_used.append(
                    {
                        "index": index,
                        "doc_type": doc.get("doc_type"),
                        "hours": doc.get("hours"),
                        "source_email_from": doc.get("source_email_from"),
                        "source_email_id": doc.get("source_email_id"),
                        "thread_id": doc.get("thread_id"),
                        "subject": doc.get("subject"),
                        "date": doc.get("date"),
                        "attachment_filename": doc.get("attachment_filename"),
                        "mime_type": doc.get("mime_type"),
                        "page_count": doc.get("page_count"),
                        "text_source": doc.get("text_source"),
                    }
                )
            potential_expense_entries.append(
                {
                    "matter": matter_name,
                    "description": description,
                    "entry_type": "potential_expense",
                    "predicted_time": 0,
                    "date": date_str,
                    "user_name": user_name,
                    "billing_rate": 0,
                    "amount_charged": 0,
                    "documents": documents_used,
                }
            )
        filtered_docs = []
        for doc in docs:
            hours = float(doc.get("hours") or 0.0)
            source_email_from = str(doc.get("source_email_from") or "").strip().lower()
            if hours <= 0 and source_email_from not in blocked_senders:
                continue
            if doc.get("doc_type") == "attachment":
                filename = str(doc.get("attachment_filename") or "").strip().lower()
                if filename:
                    if filename in seen_attachment_filenames:
                        continue
                    seen_attachment_filenames.add(filename)
            filtered_docs.append(doc)

        for doc in filtered_docs:
            matter_idx = doc["matter_idx"]
            entry = day_map.setdefault(date_str, {}).setdefault(
                matter_idx, {"docs": []}
            )
            entry["docs"].append(doc)

    client = genai.Client(api_key=get_google_api_key())
    time_entries = []
    letters = [chr(ord("A") + i) for i in range(len(matters))]

    for day in sorted(day_map.keys()):
        matter_entries = []
        for matter_idx, info in day_map[day].items():
            docs_info = info["docs"]
            if not docs_info:
                continue
            letter = letters[matter_idx]
            docs_text = [doc.get("text", "") for doc in docs_info]
            matter_entries.append((letter, matters[matter_idx], docs_text))

        if not matter_entries:
            continue

        descriptions = generate_descriptions(
            client, day, matter_entries, user_name, client_name, matter_keywords_map
        )

        for matter_idx, info in day_map[day].items():
            docs_info = info["docs"]
            if not docs_info:
                continue
            letter = letters[matter_idx]
            description_entry = descriptions.get(
                letter, {"description": "", "doc_numbers": []}
            )
            doc_numbers = description_entry.get("doc_numbers", [])
            selected_indices, selected_docs = select_documents(docs_info, doc_numbers)
            hours = sum(float(doc.get("hours", 0.0)) for doc in selected_docs)
            allow_zero_hours = any(
                str(doc.get("source_email_from") or "").strip().lower() in blocked_senders
                for doc in selected_docs
            )
            if hours <= 0 and not allow_zero_hours:
                continue
            documents_used = []
            for index in selected_indices:
                doc = docs_info[index - 1]
                documents_used.append(
                    {
                        "index": index,
                        "doc_type": doc.get("doc_type"),
                        "hours": doc.get("hours"),
                        "source_email_from": doc.get("source_email_from"),
                        "source_email_id": doc.get("source_email_id"),
                        "thread_id": doc.get("thread_id"),
                        "subject": doc.get("subject"),
                        "date": doc.get("date"),
                        "attachment_filename": doc.get("attachment_filename"),
                        "mime_type": doc.get("mime_type"),
                        "page_count": doc.get("page_count"),
                        "text_source": doc.get("text_source"),
                    }
                )
            amount = round(hours * float(billing_rate), 2)
            time_entries.append(
                {
                    "matter": matters[matter_idx],
                    "description": description_entry.get("description", ""),
                    "entry_type": "time",
                    "predicted_time": round(hours, 2),
                    "date": day,
                    "user_name": user_name,
                    "billing_rate": billing_rate,
                    "amount_charged": amount,
                    "documents": documents_used,
                }
            )

    time_entries.extend(potential_expense_entries)
    time_entries.sort(
        key=lambda entry: (
            str(entry.get("date") or ""),
            str(entry.get("matter") or ""),
            0 if entry.get("entry_type") == "time" else 1,
        )
    )

    output = {
        "client_name": client_name,
        "billing_rate": billing_rate,
        "user_name": user_name,
        "timezone": "America/Los_Angeles",
        "entries": time_entries,
    }

    if base_dir is not None:
        base_dir.mkdir(parents=True, exist_ok=True)
    storage.write_json(prefix + "time_entries.json", output)
    storage.write_json(prefix + "time_entries.perm.DONT_DELETE.json", output)

    print(f"Saved {len(time_entries)} entries to {prefix}time_entries.json")


if __name__ == "__main__":
    main()
