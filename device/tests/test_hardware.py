from __future__ import annotations

import sys
from importlib.machinery import ModuleSpec
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock

import pytest

from hcd_stamp_device.hardware import DummyCamera, DummyDisplay, PiCamera, create_hardware


@pytest.mark.parametrize(
    ("focus_controls", "expected_focus"),
    [
        (set(), {}),  # Module 2: 非対応のピント制御を指定しない。
        ({"AfMode", "LensPosition"}, {"AfMode": 0, "LensPosition": 20.0}),
        ({"AfMode"}, {}),
        ({"LensPosition"}, {}),
    ],
)
def test_pi_camera_configures_only_supported_focus_controls(
    monkeypatch: pytest.MonkeyPatch,
    focus_controls: set[str],
    expected_focus: dict[str, float],
) -> None:
    camera = Mock()
    camera.camera_controls = dict.fromkeys(focus_controls)
    monkeypatch.setitem(sys.modules, "picamera2", SimpleNamespace(Picamera2=lambda: camera))
    # ピント制御非対応のカメラではlibcamera.controlsの読み込みも不要。
    monkeypatch.setitem(
        sys.modules,
        "libcamera",
        SimpleNamespace(controls=SimpleNamespace(AfModeEnum=SimpleNamespace(Manual=0)))
        if expected_focus
        else None,
    )

    PiCamera()

    camera.create_video_configuration.assert_called_once_with(
        main={"format": "RGB888", "size": (640, 480)},
        controls={"FrameRate": 15, **expected_focus},
        buffer_count=4,
    )
    camera.configure.assert_called_once_with(camera.create_video_configuration.return_value)


def test_auto_uses_dummy_without_pi_libraries(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "picamera2", None)

    camera, display = create_hardware("auto")

    assert isinstance(camera, DummyCamera)
    assert isinstance(display, DummyDisplay)


def test_auto_fails_instead_of_dummy_when_pi_camera_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """仕様5-6/6-8: ケーブルが外れた実機がダミーで動き、ハートビートで正常に見えないようにする。"""

    def missing_camera() -> None:
        raise RuntimeError("No camera number 0 found")

    picamera2 = ModuleType("picamera2")
    picamera2.__spec__ = ModuleSpec("picamera2", None)
    picamera2.Picamera2 = missing_camera  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "picamera2", picamera2)

    with pytest.raises(RuntimeError, match="No camera"):
        create_hardware("auto")
