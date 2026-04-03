"""
Inject Gmail/Gemini credentials from App Runner (Secrets Manager → HOURLYBILL_GMAIL_GEMINI_SECRET).
Call before load_dotenv() so local .env still overrides when present.
"""

from __future__ import annotations

import json
import os


def apply_secrets_manager_json_env() -> bool:
    raw = os.environ.get("HOURLYBILL_GMAIL_GEMINI_SECRET", "").strip()
    if not raw:
        return False
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return False
    if not isinstance(data, dict):
        return False
    for key, val in data.items():
        if val is None:
            continue
        sval = val if isinstance(val, str) else str(val)
        os.environ.setdefault(str(key), sval)
    return True
