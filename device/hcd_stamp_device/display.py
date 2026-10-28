"""スタンプ画像と送信結果の液晶表示。"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Final

from PIL import Image, ImageDraw, ImageFont

from .hardware import LCD_SIZE
from .models import SendOutcome
from .stamp_motion import StampMotion

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
        # 仕様6-7: 押印成功は演出（約1.6秒）と完成した絵柄を合わせて3秒。
        if outcome is SendOutcome.STAMPED:
            return 3.0
        if outcome is SendOutcome.ALREADY:
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


class ResultOverlay:
    """送信結果の液晶表示を、表示を始めてからの経過時間で選ぶ（仕様6-2、6-7）。"""

    def __init__(self, renderer: StatusRenderer, stamp: Image.Image, motion: StampMotion) -> None:
        self._renderer = renderer
        self._stamp = stamp
        self._motion = motion
        self._frame_at: Callable[[float], Image.Image] | None = None
        self._started_at = float("-inf")
        self._until = float("-inf")

    def start(self, outcome: SendOutcome, now: float) -> None:
        if outcome is SendOutcome.STAMPED:
            self._frame_at = self._motion.frame_at
        else:
            if outcome is SendOutcome.ALREADY:
                still = self._renderer.stamp_image(self._stamp, already=True)
            else:
                still = self._renderer.status_image(outcome)

            def show_still(elapsed: float) -> Image.Image:
                del elapsed
                return still

            self._frame_at = show_still
        self._started_at = now
        self._until = now + self._renderer.duration_for(outcome)

    def image_at(self, now: float) -> Image.Image | None:
        """表示中ならその時点の画像を、表示が終わっていればNoneを返す。"""

        if self._frame_at is None or now >= self._until:
            self._frame_at = None
            return None
        return self._frame_at(now - self._started_at)


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
