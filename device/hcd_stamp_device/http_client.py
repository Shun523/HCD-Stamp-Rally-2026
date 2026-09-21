"""サーバーAPIとのHTTP通信。"""

from __future__ import annotations

import json
from typing import Protocol
from urllib import error, request

from .models import HttpResponse, NetworkError, StampRequest

HTTP_TIMEOUT_SECONDS = 5.0


class DeviceApi(Protocol):
    def send_stamp(self, stamp: StampRequest) -> HttpResponse: ...

    def send_heartbeat(
        self,
        *,
        device_id: str,
        uptime_seconds: float,
        last_stamp_count: int,
        pending_queue_count: int,
    ) -> HttpResponse: ...


class UrllibDeviceApi:
    """標準ライブラリだけで実装した機器APIクライアント。"""

    def __init__(self, base_url: str, api_key: str, timeout: float = HTTP_TIMEOUT_SECONDS) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout

    def _post(self, path: str, payload: dict[str, object]) -> HttpResponse:
        body = json.dumps(payload).encode("utf-8")
        outgoing = request.Request(
            f"{self._base_url}{path}",
            data=body,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with request.urlopen(outgoing, timeout=self._timeout) as response:
                return HttpResponse(response.status, self._read_payload(response.read()))
        except error.HTTPError as response:
            return HttpResponse(response.code, self._read_payload(response.read()))
        except (error.URLError, TimeoutError, OSError) as exception:
            raise NetworkError(str(exception)) from exception

    @staticmethod
    def _read_payload(body: bytes) -> dict[str, object]:
        try:
            decoded = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}
        return decoded if isinstance(decoded, dict) else {}

    def send_stamp(self, stamp: StampRequest) -> HttpResponse:
        return self._post(
            "/api/stamp",
            {
                "token": stamp.token,
                "device_id": stamp.device_id,
                "device_stamped_at": stamp.device_stamped_at.isoformat(),
            },
        )

    def send_heartbeat(
        self,
        *,
        device_id: str,
        uptime_seconds: float,
        last_stamp_count: int,
        pending_queue_count: int,
    ) -> HttpResponse:
        return self._post(
            "/api/heartbeat",
            {
                "device_id": device_id,
                "uptime_seconds": int(uptime_seconds),
                "last_stamp_count": last_stamp_count,
                "pending_queue_count": pending_queue_count,
            },
        )
