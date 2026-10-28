"""押印成功時の液晶演出。スタンプが落ちて着地し、きらきらがはじける（仕様6-2）。

時間配分はスマホの押印演出（デザインガイド4-4）と同じにし、240pxの液晶いっぱいに描く。
液晶の書き換えは毎秒15回程度なので、起動時に全コマを作ってメモリに置き、
押印時は経過時間でコマを選ぶ。描画が遅れても演出の長さは変わらず、コマが飛ぶだけになる。
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Final, NamedTuple

from PIL import Image, ImageDraw

from .hardware import LCD_SIZE

Easing = Callable[[float], float]
Color = tuple[int, int, int]

# web/src/styles/tokens.css と同じ色。
WHITE: Final[Color] = (255, 255, 255)
INK: Final[Color] = (35, 24, 21)
YELLOW: Final[Color] = (255, 216, 77)
CORAL: Final[Color] = (240, 85, 92)
PURPLE: Final[Color] = (106, 63, 160)

CENTER: Final = LCD_SIZE / 2
FRAME_INTERVAL: Final = 1 / 30


def cubic_bezier(x1: float, y1: float, x2: float, y2: float) -> Easing:
    """CSSの cubic-bezier() と同じ時間関数。進み具合から曲線上の位置を二分法で求める。"""

    def component(first: float, second: float, u: float) -> float:
        return 3 * first * (1 - u) ** 2 * u + 3 * second * (1 - u) * u**2 + u**3

    def ease(x: float) -> float:
        if x <= 0:
            return 0.0
        if x >= 1:
            return 1.0
        low, high = 0.0, 1.0
        for _ in range(30):
            middle = (low + high) / 2
            if component(x1, x2, middle) < x:
                low = middle
            else:
                high = middle
        return component(y1, y2, (low + high) / 2)

    return ease


def linear(x: float) -> float:
    return x


EASE_OUT: Final = cubic_bezier(0, 0, 0.58, 1)
EASE_IN_OUT: Final = cubic_bezier(0.42, 0, 0.58, 1)
DROP_IN: Final = cubic_bezier(0.55, 0, 1, 0.45)


class DropPose(NamedTuple):
    opacity: float
    scale: float
    rotation: float  # CSSと同じく時計回りが正（度）
    offset_y: float


class SparklePose(NamedTuple):
    opacity: float
    travel: float  # 1で液晶の中心、0で止まる位置
    scale: float
    rotation: float


@dataclass(frozen=True, slots=True)
class Keyframe[Pose: (DropPose, SparklePose)]:
    offset: float
    pose: Pose
    easing: Easing = linear  # 次のキーフレームまでの時間関数


@dataclass(frozen=True, slots=True)
class Track[Pose: (DropPose, SparklePose)]:
    """CSSアニメーション1本分。

    開始前は最初、終了後は最後のキーフレームを保つ（CSSの fill-mode: both と同じ）。
    """

    delay: float
    duration: float
    keyframes: tuple[Keyframe[Pose], ...]
    easing: Easing = linear

    @property
    def end(self) -> float:
        return self.delay + self.duration

    def pose_at(self, elapsed: float) -> Pose:
        if elapsed <= self.delay:
            return self.keyframes[0].pose
        progress = (elapsed - self.delay) / self.duration
        if progress >= 1:
            return self.keyframes[-1].pose
        progress = self.easing(progress)
        index = 0
        while index < len(self.keyframes) - 2 and progress > self.keyframes[index + 1].offset:
            index += 1
        start, end = self.keyframes[index], self.keyframes[index + 1]
        local = start.easing((progress - start.offset) / (end.offset - start.offset))
        return type(start.pose)._make(
            first + (second - first) * local
            for first, second in zip(start.pose, end.pose, strict=True)
        )


# 透明・1.8倍・上へ20px・-10°から加速しながら落ち、落下の55%で0.92倍に潰れて着地する。
DROP: Final = Track(
    delay=0.2,
    duration=0.76,
    keyframes=(
        Keyframe(0.0, DropPose(0.0, 1.8, -10.0, -20.0), DROP_IN),
        Keyframe(0.55, DropPose(0.8, 0.92, 0.0, 0.0), EASE_OUT),
        Keyframe(0.78, DropPose(1.0, 1.03, 0.0, 0.0), EASE_IN_OUT),
        Keyframe(1.0, DropPose(1.0, 1.0, 0.0, 0.0)),
    ),
)
LANDING_SECONDS: Final = DROP.delay + DROP.duration * 0.55


def _burst(delay: float) -> Track[SparklePose]:
    return Track(
        delay=delay,
        duration=0.84,
        easing=EASE_OUT,
        keyframes=(
            Keyframe(0.0, SparklePose(0.0, 1.0, 0.0, -60.0)),
            Keyframe(0.65, SparklePose(1.0, 0.0, 1.2, 0.0)),
            Keyframe(1.0, SparklePose(1.0, 0.0, 1.0, 0.0)),
        ),
    )


@dataclass(frozen=True, slots=True)
class Sparkle:
    """スタンプの縁に止まるきらきら1つ。center は止まる位置の中心。"""

    center: tuple[float, float]
    size: int
    color: Color
    track: Track[SparklePose]


SPARKLES: Final = (
    Sparkle((60, 62), 34, YELLOW, _burst(LANDING_SECONDS)),
    Sparkle((190, 78), 28, CORAL, _burst(LANDING_SECONDS + 0.06)),
    Sparkle((166, 192), 30, PURPLE, _burst(LANDING_SECONDS + 0.12)),
)
MOTION_SECONDS: Final = max(DROP.end, *(sparkle.track.end for sparkle in SPARKLES))

# web の Sparkle と同じ4点星（24×24の座標）。
_STAR: Final = (
    (12, 0), (15.2, 8.8), (24, 12), (15.2, 15.2), (12, 24), (8.8, 15.2), (0, 12), (8.8, 8.8)
)
_SUPERSAMPLE: Final = 4


class _SparkleSprite:
    """縁取り付きの星を高解像度で一度だけ描き、コマごとに縮小・回転して重ねる。"""

    def __init__(self, sparkle: Sparkle) -> None:
        self._sparkle = sparkle
        side = sparkle.size * _SUPERSAMPLE
        unit = side / 24
        self._image = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        ImageDraw.Draw(self._image).polygon(
            [(x * unit, y * unit) for x, y in _STAR],
            fill=(*sparkle.color, 255),
            outline=(*INK, 255),
            width=round(1.75 * _SUPERSAMPLE),
        )

    def draw(self, frame: Image.Image, elapsed: float) -> None:
        pose = self._sparkle.track.pose_at(elapsed)
        side = round(self._sparkle.size * pose.scale)
        if pose.opacity <= 0.01 or side < 1:
            return
        sprite = self._image.resize((side, side), Image.Resampling.LANCZOS)
        if pose.rotation:
            # Pillowは反時計回りが正。
            sprite = sprite.rotate(-pose.rotation, Image.Resampling.BILINEAR, expand=True)
        if pose.opacity < 1:
            sprite.putalpha(sprite.getchannel("A").point(lambda value: round(value * pose.opacity)))
        x, y = self._sparkle.center
        x += (CENTER - x) * pose.travel
        y += (CENTER - y) * pose.travel
        frame.paste(sprite, (round(x - sprite.width / 2), round(y - sprite.height / 2)), sprite)


def _place_stamp(stamp: Image.Image, pose: DropPose) -> Image.Image:
    # 動いている間のコマなので、起動時間を優先して軽い補間にする。等倍のときは元の画像のまま。
    side = max(1, round(LCD_SIZE * pose.scale))
    image = stamp.resize((side, side), Image.Resampling.BILINEAR)
    if pose.rotation:
        image = image.rotate(-pose.rotation, Image.Resampling.BILINEAR, fillcolor=WHITE)
    canvas = Image.new("RGB", (LCD_SIZE, LCD_SIZE), WHITE)
    offset = (LCD_SIZE - side) // 2
    canvas.paste(image, (offset, offset + round(pose.offset_y)))
    return canvas


def _render(stamp: Image.Image, elapsed: float, sparkles: Sequence[_SparkleSprite]) -> Image.Image:
    pose = DROP.pose_at(elapsed)
    if pose.opacity <= 0:
        frame = Image.new("RGB", (LCD_SIZE, LCD_SIZE), WHITE)
    else:
        frame = _place_stamp(stamp, pose)
        if pose.opacity < 1:
            # 白い紙の上で薄く見えるよう白へ寄せる。Image.blendと違い、白は丸めずに白のまま残る。
            frame = frame.point(lambda value: round(255 - (255 - value) * pose.opacity))
    for sparkle in sparkles:
        sparkle.draw(frame, elapsed)
    return frame


class StampMotion:
    """自機のスポットの演出を起動時に全コマ作り、押印からの経過時間でコマを返す。

    着地の瞬間（いちばん潰れたところ）がちょうど1コマになるよう、コマの時刻をずらして作る。
    """

    def __init__(self, stamp: Image.Image, frame_interval: float = FRAME_INTERVAL) -> None:
        sprites = [_SparkleSprite(sparkle) for sparkle in SPARKLES]
        self._interval = frame_interval
        self._phase = LANDING_SECONDS % frame_interval
        count = math.ceil((MOTION_SECONDS - self._phase) / frame_interval)
        self._frames = [
            _render(stamp, self._phase + index * frame_interval, sprites) for index in range(count)
        ]
        self.final = _render(stamp, MOTION_SECONDS, sprites)

    @property
    def frame_count(self) -> int:
        return len(self._frames) + 1

    def frame_at(self, elapsed: float) -> Image.Image:
        # 小数の誤差でコマの境目が前後しないよう、わずかに足してから切り捨てる。
        index = max(0, math.floor((elapsed - self._phase) / self._interval + 1e-6))
        return self._frames[index] if index < len(self._frames) else self.final
