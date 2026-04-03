"""
Storage abstraction for pipeline scripts: per-user data in S3 (when S3_BUCKET + USER_ID)
or on local filesystem (single-user). Keys are relative: 'query.json', 'inputs.json',
'clients/{client_dir}/{query_dir}/time_entries.json', etc.
"""

import json
import os
from pathlib import Path
from typing import Any, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
S3_BUCKET = os.environ.get("S3_BUCKET")
AWS_REGION = os.environ.get("AWS_REGION", "us-west-2")

_s3_client = None


def _get_s3_client():
    global _s3_client
    if _s3_client is None and S3_BUCKET:
        import boto3
        _s3_client = boto3.client("s3", region_name=AWS_REGION)
    return _s3_client


def _is_s3_not_found(exc: Exception) -> bool:
    try:
        from botocore.exceptions import ClientError
        if isinstance(exc, ClientError):
            code = exc.response.get("Error", {}).get("Code", "")
            return code in ("404", "NoSuchKey", "NotFound")
    except ImportError:
        pass
    return False


def _key_for(user_id: str, relative_key: str) -> str:
    k = relative_key.lstrip("/").replace("\\", "/")
    return f"{user_id}/{k}" if user_id else k


def _fs_path(user_id: str, relative_key: str) -> Path:
    return BASE_DIR / relative_key.replace("\\", "/").lstrip("/")


def use_s3(user_id: str) -> bool:
    return bool(S3_BUCKET and user_id)


class Storage:
    """Per-user storage: S3 when S3_BUCKET and user_id are set, else local fs."""

    def __init__(self, user_id: str):
        self.user_id = user_id or ""

    def use_s3(self) -> bool:
        return use_s3(self.user_id)

    def read_json(self, relative_key: str) -> Any:
        if self.use_s3():
            s3 = _get_s3_client()
            key = _key_for(self.user_id, relative_key)
            try:
                resp = s3.get_object(Bucket=S3_BUCKET, Key=key)
                body = resp["Body"].read().decode("utf-8")
                return json.loads(body)
            except Exception as e:
                if _is_s3_not_found(e):
                    raise FileNotFoundError(f"Key not found: {key}") from e
                raise
        path = _fs_path(self.user_id, relative_key)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def write_json(self, relative_key: str, data: Any) -> None:
        body = json.dumps(data, indent=2) + "\n"
        if self.use_s3():
            s3 = _get_s3_client()
            key = _key_for(self.user_id, relative_key)
            s3.put_object(
                Bucket=S3_BUCKET,
                Key=key,
                Body=body.encode("utf-8"),
                ContentType="application/json; charset=utf-8",
            )
            return
        path = _fs_path(self.user_id, relative_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)

    def file_exists(self, relative_key: str) -> bool:
        if self.use_s3():
            s3 = _get_s3_client()
            key = _key_for(self.user_id, relative_key)
            try:
                s3.head_object(Bucket=S3_BUCKET, Key=key)
                return True
            except Exception as e:
                if _is_s3_not_found(e):
                    return False
                raise
        return _fs_path(self.user_id, relative_key).exists()

    def get_client_query_prefix(self, client_dir: str, query_dir: str) -> str:
        return f"clients/{client_dir}/{query_dir}/"

    def get_base_dir_path(self, client_dir: str, query_dir: str) -> Optional[Path]:
        if self.use_s3():
            return None
        return BASE_DIR / "clients" / client_dir / query_dir


def get_storage(user_id: str) -> Storage:
    return Storage(user_id)
