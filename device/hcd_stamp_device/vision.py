"""OpenCVによるQR検出とカメラフレームの液晶向け変換。"""

from __future__ import annotations

from typing import Any

from PIL import Image

from .hardware import LCD_SIZE

QR_SCAN_INTERVAL = 3


class OpenCvQrDecoder:
    """仕様6-3で指定された OpenCV QRCodeDetector。"""

    def __init__(self) -> None:
        import cv2

        self._cv2: Any = cv2
        self._detector: Any = cv2.QRCodeDetector()

    def decode(self, frame: Any) -> tuple[str, Any | None]:
        gray = self._cv2.cvtColor(frame, self._cv2.COLOR_RGB2GRAY)
        text, points, _ = self._detector.detectAndDecode(gray)
        return str(text), points

    def add_detection_outline(self, frame: Any, points: Any | None) -> Any:
        """検出位置を緑枠で重ねる（仕様6-2）。"""

        if points is None:
            return frame
        polygon = points.astype("int32").reshape(-1, 2)
        outlined = frame.copy()
        self._cv2.polylines(
            outlined,
            [polygon],
            isClosed=True,
            color=(0, 255, 0),
            thickness=4,
        )
        return outlined


class NoopQrDecoder:
    """OpenCVがない開発環境でダミー機を起動するためのデコーダー。"""

    def decode(self, frame: Any) -> tuple[str, None]:
        del frame
        return "", None


def center_square(frame: Any) -> Any:
    """入力映像の中央を正方形へ切り抜く（仕様6-2）。"""

    height, width = frame.shape[:2]
    side = min(width, height)
    x = (width - side) // 2
    y = (height - side) // 2
    return frame[y : y + side, x : x + side]


def frame_to_lcd_image(frame: Any) -> Image.Image:
    """240pxへ縮小し、取り付け向きを反時計回り90度補正する（仕様6-2）。"""

    image = Image.fromarray(frame)
    image = image.resize((LCD_SIZE, LCD_SIZE), Image.Resampling.BILINEAR)
    return image.rotate(90)
