from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from hcd_stamp_device.display import ResultOverlay, StatusRenderer, load_stamp_images
from hcd_stamp_device.models import SendOutcome
from hcd_stamp_device.stamp_motion import StampMotion

ASSETS = Path(__file__).resolve().parents[1] / "hcd_stamp_device" / "assets" / "stamps"


@pytest.fixture(scope="module")
def stamp() -> Image.Image:
    return load_stamp_images(ASSETS)["spot-02"]


@pytest.fixture(scope="module")
def motion(stamp: Image.Image) -> StampMotion:
    return StampMotion(stamp)


@pytest.fixture
def overlay(stamp: Image.Image, motion: StampMotion) -> ResultOverlay:
    return ResultOverlay(StatusRenderer(), stamp, motion)


def test_nothing_is_overlaid_before_any_result(overlay: ResultOverlay) -> None:
    assert overlay.image_at(100.0) is None


def test_stamped_plays_the_motion_then_keeps_the_stamp_until_three_seconds(
    overlay: ResultOverlay, motion: StampMotion
) -> None:
    # 仕様6-2、6-7: 押印成功は演出と完成した絵柄を合わせて3秒表示し、カメラ映像へ戻る。
    overlay.start(SendOutcome.STAMPED, now=100.0)
    assert overlay.image_at(100.55) is motion.frame_at(0.55)
    assert overlay.image_at(102.9) is motion.final
    assert overlay.image_at(103.0) is None


def test_already_shows_the_still_stamp_with_a_check_for_two_seconds(
    overlay: ResultOverlay, stamp: Image.Image
) -> None:
    # 仕様6-7: 取得済みは動かさず、チェックを重ねた絵柄を2秒表示する。
    overlay.start(SendOutcome.ALREADY, now=10.0)
    first = overlay.image_at(10.0)
    assert first is not None
    assert first.getpixel((176, 198)) == (0, 100, 46)
    assert overlay.image_at(11.9) is first
    assert overlay.image_at(12.0) is None


def test_a_new_result_replaces_the_current_one(overlay: ResultOverlay, motion: StampMotion) -> None:
    overlay.start(SendOutcome.INVALID_TOKEN, now=0.0)
    overlay.start(SendOutcome.STAMPED, now=1.0)
    assert overlay.image_at(1.25) is motion.frame_at(0.25)
