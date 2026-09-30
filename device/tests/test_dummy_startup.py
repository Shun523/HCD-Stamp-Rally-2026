from __future__ import annotations

import threading
import time
from pathlib import Path

from hcd_stamp_device.app import StampDeviceApp
from hcd_stamp_device.hardware import DummyCamera, DummyDisplay
from hcd_stamp_device.models import HttpResponse, StampRequest
from hcd_stamp_device.queue import PersistentStampQueue
from hcd_stamp_device.vision import NoopQrDecoder


class FakeApi:
    def __init__(self) -> None:
        self.heartbeat_count = 0

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
        self.heartbeat_count += 1
        return HttpResponse(200, {"ok": True})


def test_app_starts_and_stops_with_dummy_camera_and_display(tmp_path: Path) -> None:
    camera = DummyCamera()
    display = DummyDisplay()
    api = FakeApi()
    assets = Path(__file__).parents[1] / "hcd_stamp_device" / "assets" / "stamps"
    app = StampDeviceApp(
        camera=camera,
        display=display,
        decoder=NoopQrDecoder(),
        api=api,
        queue=PersistentStampQueue(tmp_path / "pending.json"),
        device_id="dev-01",
        spot_id="spot-01",
        stamp_directory=assets,
    )

    runner = threading.Thread(target=app.run, name="dummy-device-test")
    runner.start()
    deadline = time.monotonic() + 1.0
    while not camera.started and time.monotonic() < deadline:
        time.sleep(0.01)

    assert camera.started
    app.stop()
    runner.join(timeout=2.0)

    assert not runner.is_alive()
    assert not camera.started
    assert display.last_image is not None
    assert display.last_image.getpixel((120, 120)) == (0, 0, 0)
    # 仕様5-6: 起動から30秒たつまでは初回ハートビートを送らない。
    assert api.heartbeat_count == 0
