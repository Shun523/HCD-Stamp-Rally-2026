from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

# mainのキュー読込からカメラ映像の液晶描画までを、別プロセスで通す。
# カメラ・液晶はダミーに差し替え、1フレーム描画後にCtrl+C相当の安全終了を行う。
STARTUP_PROGRAM = """
import numpy as np
from hcd_stamp_device import main
from hcd_stamp_device.hardware import DummyCamera, DummyDisplay

class StartupCamera(DummyCamera):
    def __init__(self):
        super().__init__()
        self.captured = False

    def capture_frame(self):
        if self.captured:
            raise KeyboardInterrupt
        self.captured = True
        print("CAMERA_FRAME_REACHED", flush=True)
        return np.full((480, 640, 3), 180, dtype=np.uint8)

class StartupDisplay(DummyDisplay):
    def show(self, image):
        assert image.size == (240, 240)
        assert image.getpixel((120, 120)) == (180, 180, 180)
        super().show(image)
        print("CAMERA_DISPLAY_REACHED", flush=True)

main.create_hardware = lambda backend: (StartupCamera(), StartupDisplay())
raise SystemExit(main.main())
"""


def write_config(directory: Path) -> tuple[Path, Path]:
    queue = directory / "pending-stamps.json"
    config = directory / "config.toml"
    config.write_text(
        f"""
[server]
base_url = "http://127.0.0.1:1"
api_key = "test"
[device]
id = "dev-05"
spot_id = "spot-05"
[storage]
queue_file = "{queue.as_posix()}"
[hardware]
backend = "dummy"
""",
        encoding="utf-8",
    )
    return config, queue


def run_startup(config: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-c", STARTUP_PROGRAM, "--config", str(config)],
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )


def test_main_reaches_camera_after_empty_queue_recovery_and_process_restart(tmp_path: Path) -> None:
    config, queue = write_config(tmp_path)
    queue.touch()

    first = run_startup(config)

    assert first.returncode == 0, first.stderr
    assert "CAMERA_FRAME_REACHED" in first.stdout
    assert "CAMERA_DISPLAY_REACHED" in first.stdout
    assert "再送キューが0バイトのため退避" in first.stderr
    assert queue.read_bytes() == b"[]"
    backups = list(tmp_path.glob("pending-stamps.json.empty-*.bak"))
    assert len(backups) == 1
    assert backups[0].read_bytes() == b""

    second = run_startup(config)

    assert second.returncode == 0, second.stderr
    assert "CAMERA_FRAME_REACHED" in second.stdout
    assert "CAMERA_DISPLAY_REACHED" in second.stdout
    assert "再送キューが0バイトのため退避" not in second.stderr
    assert list(tmp_path.glob("pending-stamps.json.empty-*.bak")) == backups


@pytest.mark.parametrize("contents", [b" ", b'[{"token":"token-1"', b"\x00"])
def test_main_preserves_nonempty_corrupt_queue_and_stops(tmp_path: Path, contents: bytes) -> None:
    config, queue = write_config(tmp_path)
    queue.write_bytes(contents)

    result = run_startup(config)

    assert result.returncode != 0
    assert "CAMERA_FRAME_REACHED" not in result.stdout
    assert "再送キューを読み込めません" in result.stderr
    assert queue.read_bytes() == contents
    assert list(tmp_path.glob("pending-stamps.json.empty-*.bak")) == []
