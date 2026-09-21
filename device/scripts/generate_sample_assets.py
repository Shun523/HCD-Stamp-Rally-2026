#!/usr/bin/env python3
"""仕様4-6の仮スタンプ画像を再生成する補助スクリプト。"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 240
COLORS = ((42, 93, 154), (28, 128, 91), (180, 95, 42), (120, 64, 150), (171, 49, 82))


def main() -> int:
    target = Path(__file__).parents[1] / "hcd_stamp_device" / "assets" / "stamps"
    target.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 25)
    small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
    for index, color in enumerate(COLORS, start=1):
        spot_id = f"spot-{index:02d}"
        image = Image.new("RGB", (SIZE, SIZE), color)
        draw = ImageDraw.Draw(image)
        draw.ellipse((24, 24, 216, 216), outline="white", width=6)
        draw.ellipse((51, 51, 189, 189), outline=(255, 230, 159), width=3)
        draw.text((120, 104), "HCD 2026", font=small, fill="white", anchor="mm")
        draw.text((120, 139), spot_id, font=font, fill="white", anchor="mm")
        draw.text((120, 175), "SAMPLE", font=small, fill=(255, 230, 159), anchor="mm")
        image.save(target / f"{spot_id}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
