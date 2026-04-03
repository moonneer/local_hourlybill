import argparse
import base64
import email
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from email import policy
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import fitz
from lxml import html

from storage_helper import get_storage

BASE_DIR = Path(__file__).resolve().parent.parent


def parse_args():
    parser = argparse.ArgumentParser(
        description="Decode raw Gmail messages into parsed email data."
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
    return query


def extract_email_data(raw_data: str) -> Dict:
    def extract_headers(message) -> List[Dict]:
        headers = []
        for name, value in message.items():
            headers.append({"name": name, "value": value})
        return headers

    def extract_body_part(part, part_id: str = "0") -> Dict:
        result = {
            "partId": part_id,
            "mimeType": part.get_content_type(),
            "headers": extract_headers(part),
        }
        if part.get_filename():
            result["filename"] = part.get_filename()
        if part.is_multipart():
            result["parts"] = []
            for i, subpart in enumerate(part.iter_parts()):
                result["parts"].append(extract_body_part(subpart, f"{part_id}.{i+1}"))
        else:
            payload = part.get_payload(decode=True)
            if payload:
                result["body"] = {
                    "size": len(payload),
                    "data": base64.b64encode(payload).decode("utf-8"),
                }
            else:
                result["body"] = {"size": 0, "data": ""}
        return result

    decoded_data = base64.urlsafe_b64decode(raw_data)
    msg = email.message_from_bytes(decoded_data, policy=policy.default)
    return extract_body_part(msg)


def extract_email_content(payload: Dict) -> Dict:
    def decode_body_data(body_data: str, mime_type: str = "") -> str:
        if mime_type.startswith("text/") and body_data:
            decoded_bytes = base64.urlsafe_b64decode(body_data)
            return decoded_bytes.decode("utf-8", errors="replace")
        return ""

    def extract_parts(part: Dict) -> Tuple[str, str, List[Dict]]:
        text_plain = ""
        text_html = ""
        attachments = []

        if "body" in part and "data" in part["body"]:
            mime_type = part.get("mimeType", "")
            content = decode_body_data(part["body"]["data"], mime_type)
            if mime_type == "text/plain":
                text_plain = content
            elif mime_type == "text/html":
                text_html = content
            elif part.get("filename"):
                attachments.append(
                    {
                        "filename": part["filename"],
                        "mime_type": mime_type,
                        "payload": part["body"]["data"],
                        "size": part["body"].get("size", 0),
                        "headers": part.get("headers", []),
                    }
                )

        if "parts" in part:
            for subpart in part["parts"]:
                sub_text_plain, sub_text_html, sub_attachments = extract_parts(subpart)
                if sub_text_plain:
                    text_plain += "_NEXT_PART_IN_MIME_OBJECT_" + sub_text_plain
                if sub_text_html:
                    text_html += "_NEXT_PART_IN_MIME_OBJECT_" + sub_text_html
                attachments.extend(sub_attachments)

        return text_plain, text_html, attachments

    text_plain, text_html, attachments = extract_parts(payload)
    return {"text_plain": text_plain, "text_html": text_html, "attachments": attachments}


def parse_html(html_string: str) -> str:
    tree = html.fromstring(html_string)
    relevant_tags = ["p", "h1", "li", "a", "tr", "br", "STRONG"]
    xpath_arg = " | ".join([f"//{tag}//text()" for tag in relevant_tags])
    paragraphs = tree.xpath(xpath_arg)
    formatted_text = " ".join([stripped for p in paragraphs if (stripped := p.strip())])
    return formatted_text


def parse_pdf(pdf_base64: str, timeout: int = 5, max_pages: Optional[int] = None):
    def extract_text(doc: fitz.Document):
        matrix = fitz.Matrix(1, 1)
        text_chunks = []
        embedded_pages = 0
        ocr_pages = 0
        for i, page in enumerate(doc):
            if max_pages is not None and i >= max_pages:
                text_chunks.append(f"Exceeded {max_pages} pages. Skipping...")
                break
            page_text = page.get_text()
            if page_text and page_text.strip():
                text_chunks.append(page_text)
                embedded_pages += 1
                continue
            pix = page.get_pixmap(matrix=matrix)
            if pix.width < 100 or pix.height < 30:
                continue
            ocrpdf = fitz.open("pdf", pix.pdfocr_tobytes())
            ocrpage = ocrpdf[0]
            ocr_text = ocrpage.get_text()
            if ocr_text:
                text_chunks.append(ocr_text)
            ocr_pages += 1
        return "".join(text_chunks), embedded_pages, ocr_pages

    pdf_bytes = base64.urlsafe_b64decode(pdf_base64)
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    if doc.needs_pass:
        return "", doc.metadata or {}, doc.page_count, "encrypted"

    page_count = doc.page_count
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(extract_text, doc)
            text, embedded_pages, ocr_pages = future.result(
                timeout=timeout * max(page_count, 1)
            )
    except TimeoutError:
        return "", doc.metadata or {}, page_count, "timeout"

    if embedded_pages and ocr_pages:
        text_source = "mixed"
    elif embedded_pages:
        text_source = "embedded"
    elif ocr_pages:
        text_source = "ocr"
    else:
        text_source = "none"

    return text, doc.metadata or {}, page_count, text_source


def normalize_headers(headers: List[Dict]) -> Dict[str, List[str]]:
    header_map: Dict[str, List[str]] = {}
    for header in headers:
        name = header.get("name", "").strip()
        if not name:
            continue
        key = name.lower()
        header_map.setdefault(key, []).append(header.get("value", ""))
    return header_map


def get_header(headers: Dict[str, List[str]], name: str) -> str:
    values = headers.get(name.lower(), [])
    return values[0] if values else ""


def parse_attachments(attachments: List[Dict]) -> List[Dict]:
    parsed = []
    for attachment in attachments:
        parsed_attachment = dict(attachment)
        if (
            parsed_attachment.get("mime_type") == "application/pdf"
            and parsed_attachment.get("payload")
        ):
            text, metadata, page_count, text_source = parse_pdf(
                parsed_attachment["payload"]
            )
            parsed_attachment["parsed_text"] = text
            parsed_attachment["metadata"] = metadata
            parsed_attachment["page_count"] = page_count
            parsed_attachment["text_source"] = text_source
        parsed.append(parsed_attachment)
    return parsed


def parse_raw_messages(raw_messages: List[Dict]) -> List[Dict]:
    parsed_emails = []
    start_time = time.time()
    for idx, message in enumerate(raw_messages, 1):
        raw_data = message.get("raw")
        if not raw_data:
            print(f"Skipping message {idx}: missing raw data.")
            continue

        payload = extract_email_data(raw_data)
        contents = extract_email_content(payload)
        if not contents["text_plain"] and contents["text_html"]:
            contents["text_plain"] = parse_html(contents["text_html"])
        contents["attachments"] = parse_attachments(contents["attachments"])

        headers = normalize_headers(payload.get("headers", []))
        metadata = {
            "subject": get_header(headers, "subject"),
            "from": get_header(headers, "from"),
            "to": get_header(headers, "to"),
            "cc": get_header(headers, "cc"),
            "bcc": get_header(headers, "bcc"),
            "date": get_header(headers, "date"),
            "message_id": get_header(headers, "message-id"),
        }

        parsed_emails.append(
            {
                "id": message.get("id"),
                "threadId": message.get("threadId"),
                "labelIds": message.get("labelIds", []),
                "historyId": message.get("historyId"),
                "internalDate": message.get("internalDate"),
                "snippet": message.get("snippet"),
                "sizeEstimate": message.get("sizeEstimate"),
                "payload": payload,
                "contents": contents,
                "headers": headers,
                "metadata": metadata,
            }
        )

        if idx % 10 == 0 or idx == len(raw_messages):
            print(f"Parsed {idx}/{len(raw_messages)} messages...")

    elapsed = time.time() - start_time
    print(f"Parsed {len(parsed_emails)} messages in {elapsed:.2f} seconds.")
    return parsed_emails


def main():
    args = parse_args()
    storage = get_storage(args.user_id)
    query = load_query_params(storage, args.query)
    client_name = query["client_name"]

    client_dir = normalize_path_segment(client_name)
    query_dir = normalize_path_segment(args.query)
    prefix = storage.get_client_query_prefix(client_dir, query_dir)
    base_dir = storage.get_base_dir_path(client_dir, query_dir)

    if not storage.file_exists(prefix + "raw_messages.json"):
        raise SystemExit(f"Missing raw data at {prefix}raw_messages.json")

    raw_messages = storage.read_json(prefix + "raw_messages.json")

    if not isinstance(raw_messages, list):
        raise SystemExit("raw_messages.json must be a list of Gmail message objects.")

    parsed_emails = parse_raw_messages(raw_messages)
    if base_dir is not None:
        base_dir.mkdir(parents=True, exist_ok=True)
    storage.write_json(prefix + "parsed_emails.json", parsed_emails)

    print(f"Saved parsed emails to {prefix}parsed_emails.json")


if __name__ == "__main__":
    main()
