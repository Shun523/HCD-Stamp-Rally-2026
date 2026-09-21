"""Pi固有の機器とアプリケーションを分離するインターフェース。"""

from __future__ import annotations

from typing import Any, Protocol

from PIL import Image


class Camera(Protocol):
    def start(self) -> None: ...

    def capture_frame(self) -> Any | None: ...

    def stop(self) -> None: ...


class Display(Protocol):
    def show(self, image: Image.Image) -> None: ...

    def clear(self) -> None: ...


class QrDecoder(Protocol):
    def decode(self, frame: Any) -> tuple[str, Any | None]: ...
