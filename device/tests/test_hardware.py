from __future__ import annotations

import sys
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from hcd_stamp_device.hardware import PiCamera


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
