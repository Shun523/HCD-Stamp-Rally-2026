from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image

from hcd_stamp_device.display import LCD_SIZE, load_stamp_images

ASSETS = Path(__file__).resolve().parents[1] / "hcd_stamp_device" / "assets" / "stamps"


def test_bundled_stamp_images_load_at_lcd_size() -> None:
    # 仕様6-2: 5スポット分の240×240画像を起動時に読み込めること。
    images = load_stamp_images(ASSETS)
    assert sorted(images) == [f"spot-{index:02d}" for index in range(1, 6)]
    assert all(image.size == (LCD_SIZE, LCD_SIZE) for image in images.values())


def test_each_spot_has_a_different_stamp_design() -> None:
    # 仕様4-6: 絵柄はスポットごとに固定で、重複させない。
    images = load_stamp_images(ASSETS)
    digests = {hashlib.sha256(image.tobytes()).hexdigest() for image in images.values()}
    assert len(digests) == 5


def test_stamp_images_are_opaque_on_a_white_background() -> None:
    # 仕様6-2: 液晶はRGBで表示するため、透過を残さず白背景に合成しておく。
    for path in sorted(ASSETS.glob("spot-*.png")):
        with Image.open(path) as image:
            assert image.mode == "RGB"
            assert image.getpixel((0, 0)) == (255, 255, 255)
