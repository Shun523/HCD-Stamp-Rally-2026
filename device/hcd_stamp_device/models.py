"""スタンプ機が扱う値オブジェクト。"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class SendOutcome(StrEnum):
    """仕様6-7の5種類の送信結果。"""

    STAMPED = "stamped"
    ALREADY = "already"
    TEMPORARILY_SAVED = "temporarily_saved"
    INVALID_TOKEN = "invalid_token"
    DEVICE_AUTH_ERROR = "device_auth_error"


@dataclass(frozen=True, slots=True)
class StampRequest:
    token: str
    device_id: str
    device_stamped_at: datetime


@dataclass(frozen=True, slots=True)
class HttpResponse:
    status: int
    payload: dict[str, object]


@dataclass(frozen=True, slots=True)
class SendResult:
    token: str
    outcome: SendOutcome
    status: int | None
    stamp_count: int | None = None
    from_queue: bool = False


class NetworkError(RuntimeError):
    """接続不能またはタイムアウトでHTTP応答を得られなかった。"""
