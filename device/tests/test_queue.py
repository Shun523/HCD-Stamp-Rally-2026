from __future__ import annotations

import json
import os
import stat
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

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

    @unittest.skipUnless(os.name == "posix", "Pi/Linuxのディレクトリ同期を検証する")
    def test_syncs_records_before_replace_and_directory_after_replace(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pending.json"
            queue = PersistentStampQueue(path)
            older = QueuedStamp("token-1", datetime(2026, 10, 31, 1, 0, tzinfo=UTC))
            newer = QueuedStamp("token-2", datetime(2026, 10, 31, 2, 0, tzinfo=UTC))
            queue.enqueue(older)
            previous = path.read_bytes()
            temporary = path.with_name(f"{path.name}.tmp")
            sync = os.fsync
            synced: list[str] = []

            def check_and_sync(descriptor: int) -> None:
                if stat.S_ISDIR(os.fstat(descriptor).st_mode):
                    # 名前の置換後も同期し、置換が未確定のまま保存成功にしない（仕様6-7）。
                    self.assertEqual(synced, ["file"])
                    self.assertFalse(temporary.exists())
                    self.assertEqual(len(PersistentStampQueue(path)), 2)
                    synced.append("directory")
                else:
                    # 新しいJSON全体を同期する間は、前のキューがそのまま読める。
                    self.assertEqual(path.read_bytes(), previous)
                    self.assertEqual(
                        [item["token"] for item in json.loads(temporary.read_text())],
                        ["token-1", "token-2"],
                    )
                    synced.append("file")
                sync(descriptor)

            with patch("hcd_stamp_device.queue.os.fsync", side_effect=check_and_sync):
                self.assertTrue(queue.enqueue(newer))

            self.assertEqual(synced, ["file", "directory"])
            recovered = PersistentStampQueue(path)
            self.assertEqual(recovered.oldest(), older)
            recovered.remove(older.token)
            self.assertEqual(recovered.oldest(), newer)

    def test_failed_file_sync_preserves_previously_saved_queue(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pending.json"
            queue = PersistentStampQueue(path)
            older = QueuedStamp("token-1", datetime(2026, 10, 31, 1, 0, tzinfo=UTC))
            queue.enqueue(older)
            previous = path.read_bytes()

            with (
                patch("hcd_stamp_device.queue.os.fsync", side_effect=OSError("write failed")),
                self.assertRaises(OSError),
            ):
                queue.enqueue(QueuedStamp("token-2", older.device_stamped_at))

            self.assertEqual(path.read_bytes(), previous)
            recovered = PersistentStampQueue(path)
            self.assertEqual(len(recovered), 1)
            self.assertEqual(recovered.oldest(), older)

    @unittest.skipUnless(os.name == "posix", "Pi/Linuxのディレクトリ同期を検証する")
    def test_failed_directory_sync_does_not_report_save_success(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pending.json"
            queue = PersistentStampQueue(path)
            item = QueuedStamp("token-1", datetime(2026, 10, 31, 1, 0, tzinfo=UTC))

            with (
                patch(
                    "hcd_stamp_device.queue.os.fsync", side_effect=[None, OSError("sync failed")]
                ),
                self.assertRaises(OSError),
            ):
                queue.enqueue(item)

            # 置換済みのファイルは有効なJSONとして残し、空に戻さない。
            self.assertEqual(PersistentStampQueue(path).oldest(), item)

    def test_corrupt_queue_is_preserved_instead_of_reset(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pending.json"
            for contents in (b" ", b'[{"token":"token-1"', b"{}", b"\x00"):
                with self.subTest(contents=contents):
                    path.write_bytes(contents)
                    with self.assertRaisesRegex(RuntimeError, "再送キューを読み込めません"):
                        PersistentStampQueue(path)
                    self.assertEqual(path.read_bytes(), contents)

    def test_empty_queue_is_archived_and_startup_recovers(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pending.json"
            path.touch()
            original = path.stat()
            previous_backup = path.with_name(f"{path.name}.empty-previous.bak")
            previous_backup.write_bytes(b"previous backup")

            with self.assertLogs("hcd_stamp_device.queue", level="WARNING") as captured:
                queue = PersistentStampQueue(path)

            self.assertEqual(len(queue), 0)
            self.assertEqual(path.read_bytes(), b"[]")
            backups = set(path.parent.glob(f"{path.name}.empty-*.bak")) - {previous_backup}
            self.assertEqual(len(backups), 1)
            backup = backups.pop()
            self.assertEqual(backup.read_bytes(), b"")
            self.assertEqual(backup.stat().st_mtime_ns, original.st_mtime_ns)
            self.assertEqual(previous_backup.read_bytes(), b"previous backup")
            self.assertIn(str(backup), captured.output[0])

            # 復旧した次の起動で再び止まらず、新しい押印も保存・再読込できる。
            self.assertEqual(len(PersistentStampQueue(path)), 0)
            item = QueuedStamp("token-1", datetime(2026, 10, 31, 1, 0, tzinfo=UTC))
            queue.enqueue(item)
            self.assertEqual(PersistentStampQueue(path).oldest(), item)
            self.assertEqual(len(list(path.parent.glob(f"{path.name}.empty-*.bak"))), 2)

    def test_empty_queue_with_temporary_file_stops_without_overwriting_either_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pending.json"
            temporary = path.with_name(f"{path.name}.tmp")
            contents = b'[{"token":"token-1"}]'
            path.touch()
            temporary.write_bytes(contents)

            with self.assertRaisesRegex(RuntimeError, "再送キューを読み込めません"):
                PersistentStampQueue(path)

            self.assertEqual(path.read_bytes(), b"")
            self.assertEqual(temporary.read_bytes(), contents)
            self.assertEqual(list(path.parent.glob(f"{path.name}.empty-*.bak")), [])

    def test_failed_empty_queue_archive_preserves_original_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pending.json"
            path.touch()

            with (
                patch.object(Path, "replace", side_effect=OSError("archive failed")),
                self.assertRaisesRegex(RuntimeError, "再送キューを読み込めません"),
            ):
                PersistentStampQueue(path)

            self.assertEqual(path.read_bytes(), b"")
            self.assertEqual(list(path.parent.glob(f"{path.name}.empty-*.bak")), [])

    def test_failed_empty_queue_reinitialization_preserves_archived_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pending.json"
            path.touch()

            with (
                patch("hcd_stamp_device.queue.os.fsync", side_effect=OSError("sync failed")),
                self.assertRaisesRegex(RuntimeError, "再送キューを読み込めません"),
            ):
                PersistentStampQueue(path)

            backups = list(path.parent.glob(f"{path.name}.empty-*.bak"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_bytes(), b"")
