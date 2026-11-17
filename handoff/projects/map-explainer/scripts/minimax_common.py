"""MiniMax 脚本共用：读 .env、选区域、发 POST 请求。仅用 Python 标准库。

密钥只从环境变量或 .env 读取，绝不写死，也不打印。
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

BASE_URLS = {
    "global": "https://api.minimax.io",
    "cn": "https://api.minimaxi.com",
}

# base_resp.status_code 中可重试的错误（限流/服务端繁忙）
RETRY_STATUS_CODES = {1000, 1001, 1002}
RETRY_HTTP_CODES = {429, 500, 502, 503, 504}


def load_dotenv() -> None:
    """依次读取 ./.env 和项目根目录 .env；已存在的环境变量优先，不会被覆盖。"""
    seen = set()
    for path in (Path.cwd() / ".env", PROJECT_ROOT / ".env"):
        path = path.resolve()
        if path in seen or not path.is_file():
            continue
        seen.add(path)
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[len("export "):]
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            if value:
                os.environ.setdefault(key, value)


def env(name: str, default: str | None = None) -> str | None:
    v = os.environ.get(name, "").strip()
    return v or default


def base_url() -> str:
    region = (env("MINIMAX_REGION", "global") or "global").lower()
    if region not in BASE_URLS:
        sys.exit(f"MINIMAX_REGION 只能是 global 或 cn，当前为 {region!r}")
    return BASE_URLS[region]


def key_status() -> str:
    return "已设置" if env("MINIMAX_API_KEY") else "未设置"


def require_key() -> str:
    key = env("MINIMAX_API_KEY")
    if not key:
        sys.exit("缺少 MINIMAX_API_KEY：请写进 .env（参考 .env.example）或设置环境变量。")
    return key


class MiniMaxError(RuntimeError):
    pass


def post_json(path: str, body: dict, *, timeout: float = 300, retries: int = 3) -> dict:
    """POST {base}{path}，校验 base_resp.status_code == 0，返回解析后的 JSON。"""
    url = base_url() + path
    group_id = env("MINIMAX_GROUP_ID")
    if group_id:
        url += "?" + urllib.parse.urlencode({"GroupId": group_id})
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {require_key()}",
        "Content-Type": "application/json",
    }

    last_err: Exception | None = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:500]
            last_err = MiniMaxError(f"HTTP {e.code}: {detail}")
            if e.code in RETRY_HTTP_CODES and attempt < retries:
                _backoff(attempt, last_err)
                continue
            raise last_err from None
        except (urllib.error.URLError, TimeoutError) as e:
            last_err = MiniMaxError(f"网络错误: {e}")
            if attempt < retries:
                _backoff(attempt, last_err)
                continue
            raise last_err from None

        base = payload.get("base_resp") or {}
        code = base.get("status_code", -1)
        if code == 0:
            return payload
        last_err = MiniMaxError(
            f"base_resp.status_code={code} status_msg={base.get('status_msg')!r} trace_id={payload.get('trace_id')}"
        )
        if code in RETRY_STATUS_CODES and attempt < retries:
            _backoff(attempt, last_err)
            continue
        raise last_err
    raise last_err or MiniMaxError("未知错误")


def download(url: str, dest: Path, timeout: float = 120) -> None:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        dest.write_bytes(resp.read())


def _backoff(attempt: int, err: Exception) -> None:
    wait = 2 ** attempt
    print(f"  ! {err}；{wait}s 后重试（第 {attempt + 1} 次）", file=sys.stderr)
    time.sleep(wait)
