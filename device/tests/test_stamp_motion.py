from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image, ImageChops

from hcd_stamp_device.display import LCD_SIZE, StatusRenderer, load_stamp_images
from hcd_stamp_device.models import SendOutcome
from hcd_stamp_device.stamp_motion import LANDING_SECONDS, MOTION_SECONDS, StampMotion

ASSETS = Path(__file__).resolve().parents[1] / "hcd_stamp_device" / "assets" / "stamps"
WHITE = (255, 255, 255)
YELLOW_SPARKLE_CENTER = (60, 62)


@pytest.fixture(scope="module")
def stamp() -> Image.Image:
    return load_stamp_images(ASSETS)["spot-01"]


@pytest.fixture(scope="module")
def motion(stamp: Image.Image) -> StampMotion:
    return StampMotion(stamp)


def ink_width(frame: Image.Image) -> int:
    box = ImageChops.difference(frame, Image.new("RGB", frame.size, WHITE)).getbbox()
    assert box is not None
    return box[2] - box[0]


def darkest(frame: Image.Image) -> int:
    low, _ = frame.convert("L").getextrema()
    assert isinstance(low, int)
    return low


def test_screen_turns_white_before_the_stamp_drops(motion: StampMotion) -> None:
    # 仕様6-2: 成功するとまず白い画面になり、そこへスタンプが落ちてくる。
    assert motion.frame_at(0.1).getextrema() == ((255, 255), (255, 255), (255, 255))


def test_stamp_fades_in_while_it_drops(motion: StampMotion) -> None:
    assert darkest(motion.frame_at(0.4)) > darkest(motion.final)


def test_stamp_lands_squashed_then_settles_to_the_full_screen(
    stamp: Image.Image, motion: StampMotion
) -> None:
    # 着地の瞬間は0.92倍まで潰れ、最後は液晶いっぱいの元の大きさに戻る（A案）。
    full = ink_width(stamp)
    assert abs(ink_width(motion.frame_at(LANDING_SECONDS)) - round(full * 0.92)) <= 3
    assert motion.final.size == (LCD_SIZE, LCD_SIZE)
    assert motion.final.getpixel((120, 120)) == stamp.getpixel((120, 120))


def test_sparkles_burst_after_landing_and_stay_on_the_stamp_rim(
    stamp: Image.Image, motion: StampMotion
) -> None:
    before = motion.frame_at(LANDING_SECONDS - 0.02)
    assert before.getpixel(YELLOW_SPARKLE_CENTER) != (255, 216, 77)
    pixel = motion.final.getpixel(YELLOW_SPARKLE_CENTER)
    assert isinstance(pixel, tuple)
    assert all(
        abs(actual - expected) <= 8
        for actual, expected in zip(pixel, (255, 216, 77), strict=True)
    )
    assert motion.frame_at(MOTION_SECONDS + 5) is motion.final


def test_motion_ends_well_before_the_success_display_does() -> None:
    # 仕様6-7: 演出（約1.6秒）のあとも完成した絵柄を見せ、成功表示は合わせて3秒。
    renderer = StatusRenderer()
    assert 1.5 < MOTION_SECONDS < 1.7
    assert renderer.duration_for(SendOutcome.STAMPED) == 3.0
    assert renderer.duration_for(SendOutcome.ALREADY) == 2.0
