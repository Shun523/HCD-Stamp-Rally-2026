"""カメラ・液晶・通信ワーカーを束ねる常駐アプリケーション。"""

from __future__ import annotations

import logging
import os
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .display import ResultOverlay, StatusRenderer, load_stamp_images
from .heartbeat import HeartbeatReporter
from .http_client import DeviceApi
from .interfaces import Camera, Display, QrDecoder
from .models import SendResult
from .queue import PersistentStampQueue
from .sender import SenderWorker
from .stamp_motion import StampMotion
from .vision import QR_SCAN_INTERVAL, OpenCvQrDecoder, center_square, frame_to_lcd_image
from .watchdog import STALL_TIMEOUT_SECONDS, LoopWatchdog

QR_RESCAN_SECONDS = 3.0


class StampDeviceApp:
    """常時スキャンしつつ、表示とネットワーク処理を分離する（仕様6-3/6-5）。"""

    def __init__(
        self,
        *,
        camera: Camera,
        display: Display,
        decoder: QrDecoder,
        api: DeviceApi,
        queue: PersistentStampQueue,
        device_id: str,
        spot_id: str,
        stamp_directory: Path,
        monotonic: Callable[[], float] = time.monotonic,
        wall_clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        sleeper: Callable[[float], None] = time.sleep,
        logger: logging.Logger | None = None,
        stall_timeout: float = STALL_TIMEOUT_SECONDS,
        on_stall: Callable[[], None] | None = None,
    ) -> None:
        self._camera = camera
        self._display = display
        self._decoder = decoder
        self._queue = queue
        self._monotonic = monotonic
        self._wall_clock = wall_clock
        self._sleeper = sleeper
        self._logger = logger or logging.getLogger(__name__)
        self._sender = SenderWorker(
            api,
            queue,
            device_id,
            monotonic=monotonic,
            wall_clock=wall_clock,
            logger=self._logger,
        )
        self._last_stamp_count = 0
        self._heartbeat = HeartbeatReporter(
            api,
            device_id,
            pending_queue_count=lambda: len(self._queue),
            last_stamp_count=lambda: self._last_stamp_count,
            monotonic=monotonic,
            logger=self._logger,
        )
        stamp = load_stamp_images(stamp_directory)[spot_id]
        # 仕様6-2: 押印時に描画を待たないよう、自機のスポットの演出を起動時に全コマ作っておく。
        rendering_started = monotonic()
        motion = StampMotion(stamp)
        self._logger.info(
            "押印演出のコマを%d枚作りました（%.2f秒）",
            motion.frame_count,
            monotonic() - rendering_started,
        )
        self._overlay = ResultOverlay(StatusRenderer(), stamp, motion)
        self._frame_number = 0
        self._last_qr_text: str | None = None
        self._last_qr_at = float("-inf")
        self._running = True
        self._stall_timeout = stall_timeout
        self._watchdog = LoopWatchdog(
            on_stall or self._exit_after_stall, timeout=stall_timeout, monotonic=monotonic
        )

    def _exit_after_stall(self) -> None:
        """固まったメインループは戻らないため、送信中の一件だけ待って異常終了する（仕様6-8）。"""

        self._logger.error(
            "メインループが%.0f秒止まりました（カメラのフレーム途絶など）。再起動のため終了します",
            self._stall_timeout,
        )
        # 送信中の一件は完了させ、失敗なら永続キューへ積ませる（仕様6-7）。
        self._sender.shutdown()
        # systemdのRestart=on-failureで再起動させる。
        os._exit(1)

    def _set_result_overlay(self, result: SendResult) -> None:
        if result.stamp_count is not None:
            self._last_stamp_count = result.stamp_count
        self._overlay.start(result.outcome, self._monotonic())

    def _process_completed_sends(self) -> None:
        for result in self._sender.poll():
            self._logger.info(
                "スタンプ送信結果: token=%s result=%s", result.token, result.outcome.value
            )
            self._set_result_overlay(result)

    def _handle_frame(self, frame: Any) -> None:
        square = center_square(frame)
        self._frame_number += 1
        text = ""
        points: Any | None = None
        if self._frame_number % QR_SCAN_INTERVAL == 0:
            text, points = self._decoder.decode(square)
        if points is not None and isinstance(self._decoder, OpenCvQrDecoder):
            square = self._decoder.add_detection_outline(square, points)

        now = self._monotonic()
        if text and (text != self._last_qr_text or now - self._last_qr_at >= QR_RESCAN_SECONDS):
            if self._sender.submit_detected(text, self._wall_clock()):
                self._last_qr_text = text
                self._last_qr_at = now
                self._logger.info("QRを読み取り、送信ワーカーへ渡しました: %s", text)

        overlay = self._overlay.image_at(now)
        self._display.show(overlay if overlay is not None else frame_to_lcd_image(square))

    def run(self) -> None:
        """Ctrl+Cまで実行し、安全な終了順を必ず守る（仕様6-8）。"""

        self._watchdog.start()
        self._camera.start()
        try:
            while self._running:
                self._watchdog.feed()
                self._process_completed_sends()
                self._heartbeat.tick()
                frame = self._camera.capture_frame()
                if frame is None:
                    self._sleeper(0.05)
                    continue
                self._handle_frame(frame)
        except KeyboardInterrupt:
            self._logger.info("Ctrl+Cを受け取りました。送信完了を待機します。")
        finally:
            self._watchdog.stop()
            # 送信中の処理を終えてから、カメラ停止・液晶消灯の順で終了する。
            for result in self._sender.shutdown():
                self._set_result_overlay(result)
            self._heartbeat.shutdown()
            self._camera.stop()
            self._display.clear()

    def stop(self) -> None:
        """テストまたは外部の終了制御用。"""

        self._running = False
