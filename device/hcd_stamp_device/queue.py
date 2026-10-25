"""再送用のファイル永続化キュー。"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class QueuedStamp:
    token: str
    device_stamped_at: datetime


class PersistentStampQueue:
    """同じトークンを一件にまとめ、原子的にファイルへ保存する（仕様6-7）。"""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._items: OrderedDict[str, QueuedStamp] = OrderedDict()
        self._lock = threading.RLock()
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            raw: Any
            with self._path.open(encoding="utf-8") as file:
                contents = file.read()
            if contents == "":
                self._recover_empty_file()
                return
            raw = json.loads(contents)
            if not isinstance(raw, list):
                raise ValueError("キューのルートは配列でなければなりません")
            for item in raw:
                if not isinstance(item, dict):
                    raise ValueError("キューの項目がオブジェクトではありません")
                token = item.get("token")
                timestamp = item.get("device_stamped_at")
                if not isinstance(token, str) or not token or not isinstance(timestamp, str):
                    raise ValueError("キューの項目が不正です")
                # 同じトークンがあれば最初の（古い）レコードを優先する。
                self._items.setdefault(token, QueuedStamp(token, datetime.fromisoformat(timestamp)))
        except (OSError, ValueError, json.JSONDecodeError) as error:
            raise RuntimeError(f"再送キューを読み込めません: {self._path}") from error

    def _recover_empty_file(self) -> None:
        """確認済みの復旧方針: 0バイトだけを保全し、空キューで起動する（仕様6-7/6-8）。"""

        temporary = self._path.with_name(f"{self._path.name}.tmp")
        if temporary.exists():
            raise ValueError(f"書き込み途中の一時ファイルが残っています: {temporary}")
        # 既存の退避ファイルを上書きせず、元ファイルの時刻・内容をそのまま保管する。
        descriptor, name = tempfile.mkstemp(
            prefix=f"{self._path.name}.empty-", suffix=".bak", dir=self._path.parent
        )
        os.close(descriptor)
        backup = Path(name)
        try:
            self._path.replace(backup)
        except OSError:
            backup.unlink()
            raise
        self._persist()
        logging.getLogger(__name__).warning(
            "再送キューが0バイトのため退避し、空のキューで起動します: queue=%s backup=%s。"
            "以前の未送信データが失われていないことを示すものではありません",
            self._path,
            backup,
        )

    def _persist(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self._path.with_name(f"{self._path.name}.tmp")
        records = [
            {"token": item.token, "device_stamped_at": item.device_stamped_at.isoformat()}
            for item in self._items.values()
        ]
        with temporary.open("w", encoding="utf-8") as file:
            json.dump(records, file, ensure_ascii=False, separators=(",", ":"))
            file.flush()
            # 仕様6-7: 内容のディスク同期が完了してから、前のキューと置き換える。
            os.fsync(file.fileno())
        temporary.replace(self._path)
        if os.name == "posix":
            # Pi/Linuxでは名前の置換も永続化してから、一時保存の完了を返す（仕様6-7）。
            directory = os.open(self._path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)

    def enqueue(self, item: QueuedStamp) -> bool:
        """未登録なら追加する。追加済みなら古いタイムスタンプを保つ。"""

        with self._lock:
            if item.token in self._items:
                return False
            self._items[item.token] = item
            self._persist()
            return True

    def oldest(self) -> QueuedStamp | None:
        with self._lock:
            return next(iter(self._items.values()), None)

    def remove(self, token: str) -> bool:
        with self._lock:
            if token not in self._items:
                return False
            del self._items[token]
            self._persist()
            return True

    def clear(self) -> bool:
        """全件を削除し、空の状態を永続化する（仕様6-7）。"""

        with self._lock:
            if not self._items:
                return False
            self._items.clear()
            self._persist()
            return True

    def __len__(self) -> int:
        with self._lock:
            return len(self._items)
