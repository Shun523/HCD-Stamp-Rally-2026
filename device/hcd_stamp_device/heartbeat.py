"""30秒ごとのハートビート送信。"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any

from .http_client import DeviceApi

HEARTBEAT_INTERVAL_SECONDS = 30.0


class HeartbeatReporter:
    """カメラループをブロックせず、機体状態を30秒ごとに送る。"""

    def __init__(
        self,
        api: DeviceApi,
        device_id: str,
        pending_queue_count: Callable[[], int],
        last_stamp_count: Callable[[], int],
        *,
        monotonic: Callable[[], float] = time.monotonic,
        logger: logging.Logger | None = None,
    ) -> None:
        self._api = api
        self._device_id = device_id
        self._pending_queue_count = pending_queue_count
        self._last_stamp_count = last_stamp_count
        self._monotonic = monotonic
        self._logger = logger or logging.getLogger(__name__)
        self._started_at = monotonic()
        self._last_sent_at = float("-inf")
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="heartbeat-sender")
        self._future: Future[Any] | None = None

    def tick(self, now: float | None = None) -> None:
        """期限到来時に未送信キュー件数を含めて送る（仕様6-7）。"""

        current = self._monotonic() if now is None else now
        if self._future is not None and self._future.done():
            try:
                self._future.result()
            except Exception:
                self._logger.warning("ハートビート送信に失敗しました", exc_info=True)
            self._future = None
        if self._future is not None or current - self._last_sent_at < HEARTBEAT_INTERVAL_SECONDS:
            return
        self._last_sent_at = current
        self._future = self._executor.submit(
            self._api.send_heartbeat,
            device_id=self._device_id,
            uptime_seconds=current - self._started_at,
            last_stamp_count=self._last_stamp_count(),
            pending_queue_count=self._pending_queue_count(),
        )

    def shutdown(self) -> None:
        self._executor.shutdown(wait=True, cancel_futures=False)
