from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from hcd_stamp_device.app import StampDeviceApp
from hcd_stamp_device.hardware import DummyDisplay
from hcd_stamp_device.models import HttpResponse, StampRequest
from hcd_stamp_device.queue import PersistentStampQueue
from hcd_stamp_device.vision import NoopQrDecoder
from hcd_stamp_device.watchdog import LoopWatchdog


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_fires_once_when_not_fed_within_timeout() -> None:
    clock = FakeClock()
    stalls: list[float] = []
    watchdog = LoopWatchdog(lambda: stalls.append(clock.now), timeout=5.0, monotonic=clock)
    watchdog.feed()

    clock.now = 4.9
    assert not watchdog.check()
    clock.now = 5.0
    assert watchdog.check()
    clock.now = 20.0
    assert not watchdog.check()

    assert stalls == [5.0]


def test_feed_postpones_the_deadline() -> None:
    clock = FakeClock()
    stalls: list[float] = []
    watchdog = LoopWatchdog(lambda: stalls.append(clock.now), timeout=5.0, monotonic=clock)
    watchdog.feed()

    clock.now = 4.0
    watchdog.feed()
    clock.now = 8.0
    assert not watchdog.check()

    assert stalls == []


class FakeApi:
    def send_stamp(self, stamp: StampRequest) -> HttpResponse:
        del stamp
        return HttpResponse(200, {"result": "stamped", "stamp_count": 1})

    def send_heartbeat(
        self,
        *,
        device_id: str,
        uptime_seconds: float,
        last_stamp_count: int,
        pending_queue_count: int,
    ) -> HttpResponse:
        del device_id, uptime_seconds, last_stamp_count, pending_queue_count
        return HttpResponse(200, {"ok": True})


class FrozenCamera:
    """libcameraのフロントエンドタイムアウトのように、capture_frameが戻らないカメラ。"""

    def __init__(self) -> None:
        self.release = threading.Event()

    def start(self) -> None:
        pass

    def capture_frame(self) -> Any | None:
        self.release.wait()
        return None

    def stop(self) -> None:
        pass


def test_app_reports_stall_when_camera_stops_delivering_frames(tmp_path: Path) -> None:
    camera = FrozenCamera()
    stalled = threading.Event()
    assets = Path(__file__).parents[1] / "hcd_stamp_device" / "assets" / "stamps"
    app = StampDeviceApp(
        camera=camera,
        display=DummyDisplay(),
        decoder=NoopQrDecoder(),
        api=FakeApi(),
        queue=PersistentStampQueue(tmp_path / "pending.json"),
        device_id="dev-01",
        spot_id="spot-01",
        stamp_directory=assets,
        stall_timeout=0.2,
        on_stall=stalled.set,
    )

    runner = threading.Thread(target=app.run, name="frozen-camera-test")
    runner.start()
    try:
        assert stalled.wait(timeout=2.0)
    finally:
        app.stop()
        camera.release.set()
        runner.join(timeout=2.0)

    assert not runner.is_alive()


def test_does_not_fire_before_first_feed() -> None:
    clock = FakeClock()
    stalls: list[float] = []
    watchdog = LoopWatchdog(lambda: stalls.append(clock.now), timeout=5.0, monotonic=clock)

    clock.now = 60.0
    assert not watchdog.check()

    assert stalls == []
