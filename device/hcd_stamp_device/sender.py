"""カメラ処理から独立した、単一スレッドの送信・再送ワーカー。"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime

from .http_client import DeviceApi
from .models import HttpResponse, NetworkError, SendOutcome, SendResult, StampRequest
from .queue import PersistentStampQueue, QueuedStamp

RETRY_INTERVAL_SECONDS = 5.0


def classify_response(response: HttpResponse) -> SendOutcome:
    """HTTP応答を仕様6-7の5分類へ変換する。"""

    result = response.payload.get("result")
    if response.status == 200 and result == "stamped":
        return SendOutcome.STAMPED
    if response.status == 200 and result == "already":
        return SendOutcome.ALREADY
    if response.status in {401, 403}:
        return SendOutcome.DEVICE_AUTH_ERROR
    if response.status in {408, 429} or response.status >= 500:
        return SendOutcome.TEMPORARILY_SAVED
    # 404 invalid_tokenを含む、再送対象外の4xxは無効なQRとして扱う。
    if 400 <= response.status < 500:
        return SendOutcome.INVALID_TOKEN
    # 想定外の2xx/3xxは保存済みと確認できないので、一時保存として再送する。
    return SendOutcome.TEMPORARILY_SAVED


class SenderWorker:
    """同時送信を一件に制限し、通信失敗をファイルキューへ退避する（仕様6-3/6-7）。"""

    def __init__(
        self,
        api: DeviceApi,
        queue: PersistentStampQueue,
        device_id: str,
        *,
        logger: logging.Logger | None = None,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._api = api
        self._queue = queue
        self._device_id = device_id
        self._logger = logger or logging.getLogger(__name__)
        self._monotonic = monotonic
        # 仕様6-3: カメラ表示を止めない、最大一件だけの送信ワーカー。
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="stamp-sender")
        self._future: Future[SendResult] | None = None
        self._last_retry_at = float("-inf")

    @property
    def busy(self) -> bool:
        # 完了済みでもpoll()で結果を反映するまでは次のFutureで上書きしない。
        return self._future is not None

    def submit_detected(self, token: str, detected_at: datetime) -> bool:
        """新規読み取りを送信する。送信中なら仕様どおり受け付けない。"""

        if self.busy:
            return False
        self._future = self._executor.submit(self._send, token, detected_at, False)
        return True

    def _send(self, token: str, detected_at: datetime, from_queue: bool) -> SendResult:
        try:
            response = self._api.send_stamp(
                StampRequest(token=token, device_id=self._device_id, device_stamped_at=detected_at)
            )
            outcome = classify_response(response)
            stamp_count = response.payload.get("stamp_count")
            result = SendResult(
                token=token,
                outcome=outcome,
                status=response.status,
                stamp_count=stamp_count if isinstance(stamp_count, int) else None,
                from_queue=from_queue,
            )
        except NetworkError:
            result = SendResult(
                token=token,
                outcome=SendOutcome.TEMPORARILY_SAVED,
                status=None,
                from_queue=from_queue,
            )

        # 仕様6-7: 一時保存のみ積み、再送済みの成功/対象外4xxはキューから除く。
        if result.outcome is SendOutcome.TEMPORARILY_SAVED:
            self._queue.enqueue(QueuedStamp(token=token, device_stamped_at=detected_at))
        elif from_queue:
            self._queue.remove(token)
            if result.outcome in {SendOutcome.INVALID_TOKEN, SendOutcome.DEVICE_AUTH_ERROR}:
                self._logger.warning(
                    "再送対象外の応答のため破棄: token=%s status=%s", token, result.status
                )
        return result

    def poll(self, now: float | None = None) -> list[SendResult]:
        """完了結果を回収し、空いていれば古いキューを5秒間隔で再送する。"""

        completed: list[SendResult] = []
        if self._future is not None and self._future.done():
            completed.append(self._future.result())
            self._future = None

        current = self._monotonic() if now is None else now
        queued = self._queue.oldest()
        should_retry = (
            self._future is None
            and queued is not None
            and current - self._last_retry_at >= RETRY_INTERVAL_SECONDS
        )
        if queued is not None and should_retry:
            self._last_retry_at = current
            self._future = self._executor.submit(
                self._send, queued.token, queued.device_stamped_at, True
            )
        return completed

    def shutdown(self) -> list[SendResult]:
        """送信中の一件を完了させてから停止する（仕様6-8）。"""

        self._executor.shutdown(wait=True, cancel_futures=False)
        completed: list[SendResult] = []
        if self._future is not None:
            completed.append(self._future.result())
            self._future = None
        return completed
