"""Raspberry Pi実装と開発PC用ダミー実装。"""

from __future__ import annotations

from importlib.util import find_spec
from typing import Any

from PIL import Image

from .interfaces import Camera, Display

LCD_SIZE = 240
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
CAMERA_FPS = 15


class DummyCamera:
    """Pi以外でもプロセス起動・終了確認できるカメラ。"""

    def __init__(self) -> None:
        self.started = False

    def start(self) -> None:
        self.started = True

    def capture_frame(self) -> None:
        return None

    def stop(self) -> None:
        self.started = False


class DummyDisplay:
    """描画した最後の画像を保持する、テスト兼開発用液晶。"""

    def __init__(self) -> None:
        self.last_image: Image.Image | None = None

    def show(self, image: Image.Image) -> None:
        self.last_image = image.copy()

    def clear(self) -> None:
        self.last_image = Image.new("RGB", (LCD_SIZE, LCD_SIZE), "black")


class PiCamera:
    """Picamera2によるPi Camera Module 2/3実装（仕様6-2）。"""

    def __init__(self) -> None:
        from picamera2 import Picamera2  # type: ignore[import-not-found]

        self._camera: Any = Picamera2()
        camera_controls: dict[str, Any] = {"FrameRate": CAMERA_FPS}
        # 仕様6-2: ピント制御対応のModule 3は利用者指定の位置20で固定する。
        # Module 2では非対応の制御を送らず、従来のフレームレート設定だけを使う。
        if {"AfMode", "LensPosition"}.issubset(self._camera.camera_controls):
            from libcamera import controls  # type: ignore[import-not-found]

            camera_controls.update(
                AfMode=controls.AfModeEnum.Manual,
                LensPosition=20.0,
            )
        config = self._camera.create_video_configuration(
            main={"format": "RGB888", "size": (CAMERA_WIDTH, CAMERA_HEIGHT)},
            controls=camera_controls,
            buffer_count=4,
        )
        self._camera.configure(config)

    def start(self) -> None:
        self._camera.start()

    def capture_frame(self) -> Any:
        return self._camera.capture_array("main")

    def stop(self) -> None:
        self._camera.stop()
        self._camera.close()


class PiDisplay:
    """GC9A01A円形240px液晶の実装（仕様6-1）。"""

    def __init__(self) -> None:
        import board  # type: ignore[import-not-found]
        import digitalio  # type: ignore[import-not-found]
        from adafruit_rgb_display import gc9a01a  # type: ignore[import-not-found]

        cs = digitalio.DigitalInOut(board.CE0)
        dc = digitalio.DigitalInOut(board.D25)
        reset = digitalio.DigitalInOut(board.D27)
        self._display = gc9a01a.GC9A01A(
            board.SPI(),
            cs=cs,
            dc=dc,
            rst=reset,
            width=LCD_SIZE,
            height=LCD_SIZE,
            # 液晶の取り付け向きに合わせ、表示する画像をすべて反時計回りに90度回す。
            # カメラ映像の向き補正（仕様6-2）はこれとは別に vision.py で行う。
            rotation=90,
            baudrate=24_000_000,
        )

    def show(self, image: Image.Image) -> None:
        self._display.image(image)

    def clear(self) -> None:
        self.show(Image.new("RGB", (LCD_SIZE, LCD_SIZE), "black"))


def create_hardware(backend: str) -> tuple[Camera, Display]:
    """autoではPi用依存がない開発PCにだけダミーを選ぶ。

    Picamera2がある実機でカメラを開けない（ケーブル外れなど）ときはダミーにせず異常終了させる。
    ダミーで動き続けるとハートビートが送られ、ダッシュボードで正常に見えるため（仕様5-6、6-8）。
    """

    if backend == "dummy" or (backend == "auto" and find_spec("picamera2") is None):
        return DummyCamera(), DummyDisplay()
    return PiCamera(), PiDisplay()
