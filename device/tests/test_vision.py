from __future__ import annotations

import numpy as np

from hcd_stamp_device.hardware import LCD_SIZE
from hcd_stamp_device.vision import frame_to_lcd_image


def test_lcd_image_turns_the_camera_frame_upside_down() -> None:
    # 仕様6-2: 取り付け向きの補正として、カメラ映像を180度回して液晶に出す。
    frame = np.zeros((480, 480, 3), dtype=np.uint8)
    frame[:240, :240] = (255, 255, 255)  # 左上だけ白

    image = frame_to_lcd_image(frame).convert("L")

    assert image.size == (LCD_SIZE, LCD_SIZE)
    corner = LCD_SIZE // 4
    assert image.getpixel((LCD_SIZE - corner, LCD_SIZE - corner)) == 255  # 右下へ移る
    assert image.getpixel((corner, corner)) == 0
