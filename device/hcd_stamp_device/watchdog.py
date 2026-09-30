"""メインループの停止を検知する監視スレッド。"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable

# 15fpsで1フレーム約67ms。QR解析と液晶転送を含めても1周は1秒に満たない。
STALL_TIMEOUT_SECONDS = 5.0
CHECK_INTERVAL_SECONDS = 0.5


class LoopWatchdog:
    """最初のfeed()以降、一定時間feed()されなければon_stallを一度だけ呼ぶ。

    仕様6-8の自動再起動を、プロセスが終了せず固まった場合にも効かせる。
    """

    def __init__(
        self,
        on_stall: Callable[[], None],
        *,
        timeout: float = STALL_TIMEOUT_SECONDS,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._on_stall = on_stall
        self._timeout = timeout
        self._monotonic = monotonic
        self._last_fed_at: float | None = None
        self._fired = False
        self._stopped = threading.Event()
        self._thread: threading.Thread | None = None

    def feed(self) -> None:
        self._last_fed_at = self._monotonic()

    def check(self) -> bool:
        """期限切れなら通知し、Trueを返す。通知は一度だけ行う。"""

        last_fed_at = self._last_fed_at
        if self._fired or last_fed_at is None or self._monotonic() - last_fed_at < self._timeout:
            return False
        self._fired = True
        self._on_stall()
        return True

    def start(self) -> None:
        self._thread = threading.Thread(target=self._watch, name="loop-watchdog", daemon=True)
        self._thread.start()

    def _watch(self) -> None:
        interval = min(CHECK_INTERVAL_SECONDS, self._timeout / 4)
        while not self._stopped.wait(interval):
            if self.check():
                return

    def stop(self) -> None:
        self._stopped.set()
        if self._thread is not None and self._thread is not threading.current_thread():
            self._thread.join()
