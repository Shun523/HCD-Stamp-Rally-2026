from __future__ import annotations

import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path

from hcd_stamp_device.queue import PersistentStampQueue, QueuedStamp


class QueueTests(unittest.TestCase):
    def test_persists_and_deduplicates_token(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pending.json"
            queue = PersistentStampQueue(path)
            older = datetime(2026, 10, 31, 1, 0, tzinfo=UTC)
            newer = datetime(2026, 10, 31, 2, 0, tzinfo=UTC)

            self.assertTrue(queue.enqueue(QueuedStamp("token-1", older)))
            self.assertFalse(queue.enqueue(QueuedStamp("token-1", newer)))
            self.assertTrue(queue.enqueue(QueuedStamp("token-2", newer)))

            recovered = PersistentStampQueue(path)
            self.assertEqual(len(recovered), 2)
            self.assertEqual(recovered.oldest(), QueuedStamp("token-1", older))
            self.assertTrue(recovered.remove("token-1"))
            self.assertEqual(PersistentStampQueue(path).oldest(), QueuedStamp("token-2", newer))

            self.assertTrue(recovered.clear())
            self.assertFalse(recovered.clear())
            self.assertEqual(len(PersistentStampQueue(path)), 0)
