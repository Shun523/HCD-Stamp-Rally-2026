"""スタンプ画像と送信結果の液晶表示。"""

from __future__ import annotations

from pathlib import Path
from typing import Final

from PIL import Image, ImageDraw, ImageFont

from .hardware import LCD_SIZE
from .models import SendOutcome

FONT_CANDIDATES: Final[tuple[Path, ...]] = (
    Path(__file__).with_name("assets") / "fonts" / "IPAexGothic.ttf",
    Path("/usr/share/fonts/opentype/ipaexfont-gothic/ipaexg.ttf"),
    Path("/usr/share/fonts/truetype/fonts-japanese-gothic.ttf"),
)


def load_japanese_font(size: int) -> ImageFont.FreeTypeFont:
    """同梱IPAexゴシックを優先し、日英の二言語表示に使用する（仕様6-7）。"""

    for candidate in FONT_CANDIDATES:
        if candidate.is_file():
            return ImageFont.truetype(candidate, size)
    raise RuntimeError(
        "日本語フォントが見つかりません。assets/fonts/IPAexGothic.ttf を配置してください"
    )


class StatusRenderer:
    """240px円形液晶へ短い日英メッセージを描く。"""

    _STATUS: Final[dict[SendOutcome, tuple[str, str, str, int]]] = {
        SendOutcome.TEMPORARILY_SAVED: ("◷", "あとで反映されます", "Saved for later", 3),
        SendOutcome.INVALID_TOKEN: ("×", "このQRは使えません", "This QR is invalid", 2),
        SendOutcome.DEVICE_AUTH_ERROR: ("⚒", "スタッフを呼んでください", "Please call staff", 5),
    }

    def __init__(self) -> None:
        self._title_font = load_japanese_font(22)
        self._body_font = load_japanese_font(16)
        self._icon_font = load_japanese_font(58)

    def duration_for(self, outcome: SendOutcome) -> float:
        if outcome in {SendOutcome.STAMPED, SendOutcome.ALREADY}:
            return 2.0
        return float(self._STATUS[outcome][3])

    def status_image(self, outcome: SendOutcome) -> Image.Image:
        icon, japanese, english, _ = self._STATUS[outcome]
        color = (150, 105, 0) if outcome is SendOutcome.TEMPORARILY_SAVED else (108, 28, 28)
        image = Image.new("RGB", (LCD_SIZE, LCD_SIZE), color)
        draw = ImageDraw.Draw(image)
        draw.text((120, 62), icon, font=self._icon_font, fill="white", anchor="mm")
        draw.text((120, 132), japanese, font=self._title_font, fill="white", anchor="mm")
        draw.text((120, 164), english, font=self._body_font, fill="white", anchor="mm")
        return image

    def stamp_image(self, stamp: Image.Image, already: bool) -> Image.Image:
        image = stamp.copy().convert("RGB")
        if already:
            draw = ImageDraw.Draw(image)
            draw.ellipse((169, 169, 227, 227), fill=(0, 100, 46), outline="white", width=3)
            draw.text((198, 198), "✓", font=self._title_font, fill="white", anchor="mm")
        return image


def load_stamp_images(directory: Path) -> dict[str, Image.Image]:
    """5スポットの240×240画像を起動時に全件メモリへ読み込む（仕様6-2）。"""

    images: dict[str, Image.Image] = {}
    for index in range(1, 6):
        spot_id = f"spot-{index:02d}"
        path = next(
            (
                candidate
                for candidate in (directory / f"{spot_id}.png", directory / f"{spot_id}.jpg")
                if candidate.is_file()
            ),
            None,
        )
        if path is None:
            raise FileNotFoundError(f"スタンプ画像が見つかりません: {spot_id}.png または .jpg")
        with Image.open(path) as image:
            if image.size != (LCD_SIZE, LCD_SIZE):
                raise ValueError(f"スタンプ画像は240×240である必要があります: {path}")
            images[spot_id] = image.convert("RGB").copy()
    return images
