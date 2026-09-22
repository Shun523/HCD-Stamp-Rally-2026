from __future__ import annotations

import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path

from hcd_stamp_device.main import resend_simulated_stamp, send_simulated_token
from hcd_stamp_device.models import HttpResponse, NetworkError, SendOutcome, StampRequest
from hcd_stamp_device.queue import PersistentStampQueue, QueuedStamp
from hcd_stamp_device.sender import SenderWorker, classify_response

OPERATING_NOW = datetime(2026, 10, 31, 6, 0, tzinfo=UTC)


class FakeApi:
    def __init__(self, replies: list[HttpResponse | Exception]) -> None:
        self.replies = replies
        self.stamps: list[StampRequest] = []

    def send_stamp(self, stamp: StampRequest) -> HttpResponse:
        self.stamps.append(stamp)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply

    def send_heartbeat(self, **_: object) -> HttpResponse:
        return HttpResponse(200, {"ok": True})


class SenderTests(unittest.TestCase):
    def test_classifies_all_five_specification_outcomes(self) -> None:
        self.assertEqual(
            classify_response(HttpResponse(200, {"result": "stamped"})), SendOutcome.STAMPED
        )
        self.assertEqual(
            classify_response(HttpResponse(200, {"result": "already"})), SendOutcome.ALREADY
        )
        self.assertEqual(
            classify_response(HttpResponse(503, {})), SendOutcome.TEMPORARILY_SAVED
        )
        self.assertEqual(
            classify_response(HttpResponse(404, {"result": "invalid_token"})),
            SendOutcome.INVALID_TOKEN,
        )
        self.assertEqual(classify_response(HttpResponse(401, {})), SendOutcome.DEVICE_AUTH_ERROR)

    def test_network_failure_is_persisted_and_retried_then_removed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            queue = PersistentStampQueue(Path(directory) / "pending.json")
            api = FakeApi(
                [
                    NetworkError("offline"),
                    HttpResponse(200, {"result": "stamped", "stamp_count": 1}),
                ]
            )
            worker = SenderWorker(
                api, queue, "dev-01", monotonic=lambda: 0, wall_clock=lambda: OPERATING_NOW
            )
            occurred = datetime(2026, 10, 31, 1, 2, 3, tzinfo=UTC)
            self.assertTrue(worker.submit_detected("token-1", occurred))
            worker.shutdown()
            self.assertEqual(len(queue), 1)

            # 新しいワーカーでも古い端末時刻を保って、5秒後から古い順に再送する。
            worker = SenderWorker(
                api, queue, "dev-01", monotonic=lambda: 5, wall_clock=lambda: OPERATING_NOW
            )
            self.assertEqual(worker.poll(now=5), [])
            results = worker.shutdown()
            self.assertEqual(results[0].outcome, SendOutcome.STAMPED)
            self.assertTrue(results[0].from_queue)
            self.assertEqual(api.stamps[1].device_stamped_at, occurred)
            self.assertEqual(len(queue), 0)

    def test_non_retryable_4xx_drops_a_queued_item(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            queue = PersistentStampQueue(Path(directory) / "pending.json")
            item = QueuedStamp("bad-token", datetime(2026, 10, 31, tzinfo=UTC))
            queue.enqueue(item)
            api = FakeApi([HttpResponse(404, {"result": "invalid_token"})])
            worker = SenderWorker(
                api, queue, "dev-01", monotonic=lambda: 5, wall_clock=lambda: OPERATING_NOW
            )
            worker.poll(now=5)
            result = worker.shutdown()[0]
            self.assertEqual(result.outcome, SendOutcome.INVALID_TOKEN)
            self.assertEqual(len(queue), 0)

    def test_allows_only_one_concurrent_send(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            queue = PersistentStampQueue(Path(directory) / "pending.json")
            api = FakeApi([HttpResponse(200, {"result": "stamped"})])
            worker = SenderWorker(api, queue, "dev-01", wall_clock=lambda: OPERATING_NOW)
            timestamp = datetime.now(UTC)
            self.assertTrue(worker.submit_detected("one", timestamp))
            self.assertFalse(worker.submit_detected("two", timestamp))
            worker.shutdown()

    def test_camera_less_simulation_persists_then_resends_after_restart(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            queue = PersistentStampQueue(Path(directory) / "pending.json")
            api = FakeApi(
                [
                    NetworkError("offline"),
                    HttpResponse(200, {"result": "stamped", "stamp_count": 1}),
                ]
            )

            saved = send_simulated_token(
                api, queue, "dev-01", "token-1", wall_clock=lambda: OPERATING_NOW
            )
            self.assertEqual(saved.outcome, SendOutcome.TEMPORARILY_SAVED)
            self.assertEqual(len(queue), 1)

            resent = resend_simulated_stamp(
                api, queue, "dev-01", wall_clock=lambda: OPERATING_NOW
            )
            self.assertIsNotNone(resent)
            assert resent is not None
            self.assertEqual(resent.outcome, SendOutcome.STAMPED)
            self.assertTrue(resent.from_queue)
            self.assertEqual(len(queue), 0)

    def test_clears_every_queued_stamp_at_november_first_in_japan(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            queue = PersistentStampQueue(Path(directory) / "pending.json")
            queue.enqueue(QueuedStamp("token-1", datetime(2026, 10, 31, 6, 59, tzinfo=UTC)))
            queue.enqueue(QueuedStamp("token-2", datetime(2026, 10, 31, 7, 0, tzinfo=UTC)))
            api = FakeApi([])

            worker = SenderWorker(
                api,
                queue,
                "dev-01",
                wall_clock=lambda: datetime(2026, 10, 31, 15, 0, tzinfo=UTC),
            )

            self.assertEqual(len(queue), 0)
            self.assertFalse(worker.retry_oldest_once())
            self.assertEqual(api.stamps, [])
            worker.shutdown()

    def test_running_worker_clears_queue_when_date_rolls_to_november_first(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            queue = PersistentStampQueue(Path(directory) / "pending.json")
            queue.enqueue(QueuedStamp("token-1", OPERATING_NOW))
            current = [datetime(2026, 10, 31, 14, 59, 59, tzinfo=UTC)]
            api = FakeApi([])
            worker = SenderWorker(api, queue, "dev-01", wall_clock=lambda: current[0])

            self.assertEqual(len(queue), 1)
            current[0] = datetime(2026, 10, 31, 15, 0, tzinfo=UTC)
            self.assertEqual(worker.poll(), [])
            self.assertEqual(len(queue), 0)
            self.assertEqual(api.stamps, [])
            worker.shutdown()
