from __future__ import annotations

import unittest

from hcd_stamp_device.heartbeat import HeartbeatReporter
from hcd_stamp_device.models import HttpResponse


class FakeApi:
    def __init__(self) -> None:
        self.heartbeats: list[dict[str, object]] = []

    def send_stamp(self, **_: object) -> HttpResponse:
        return HttpResponse(200, {})

    def send_heartbeat(self, **payload: object) -> HttpResponse:
        self.heartbeats.append(payload)
        return HttpResponse(200, {"ok": True})


class HeartbeatTests(unittest.TestCase):
    def test_includes_pending_queue_count_every_30_seconds(self) -> None:
        api = FakeApi()
        reporter = HeartbeatReporter(
            api,
            "dev-01",
            pending_queue_count=lambda: 4,
            last_stamp_count=lambda: 2,
            monotonic=lambda: 0,
        )
        reporter.tick(now=30)
        reporter.shutdown()

        self.assertEqual(
            api.heartbeats,
            [
                {
                    "device_id": "dev-01",
                    "uptime_seconds": 30,
                    "last_stamp_count": 2,
                    "pending_queue_count": 4,
                }
            ],
        )

    def test_first_heartbeat_waits_30_seconds_after_start(self) -> None:
        """仕様5-6: 30秒もたずに再起動を繰り返す機体はハートビートを送らず、断として検知される。"""

        api = FakeApi()
        reporter = HeartbeatReporter(
            api,
            "dev-01",
            pending_queue_count=lambda: 0,
            last_stamp_count=lambda: 0,
            monotonic=lambda: 0,
        )
        reporter.tick(now=0)
        reporter.tick(now=29.9)
        reporter.shutdown()

        self.assertEqual(api.heartbeats, [])
