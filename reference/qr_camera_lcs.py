import os
import time
import textwrap
from concurrent.futures import ThreadPoolExecutor

import board
import cv2
import digitalio
import numpy as np

from PIL import Image, ImageDraw, ImageFont
from picamera2 import Picamera2
from adafruit_rgb_display import gc9a01a

try:
    # Piでは2ファイルを同じディレクトリへ置く
    from pi_stamp_client import (
        StampRequestError,
        send_stamp,
    )
except ModuleNotFoundError:
    # このリポジトリ直下から実行する場合
    from stamp_latency_test.pi_stamp_client import (
        StampRequestError,
        send_stamp,
    )


LCD_SIZE = 240

CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480
CAMERA_FPS = 15

# 3フレームに1回だけQRを解析
QR_SCAN_INTERVAL = 3

# 読み取り成功画面を表示する秒数
QR_MESSAGE_SECONDS = 2.0

# 同じQRを再認識するまでの時間
QR_RESCAN_SECONDS = 3.0

# Cloud Runへの通信タイムアウト
STAMP_REQUEST_TIMEOUT_SECONDS = 10.0

FONT_PATH = (
    "/usr/share/fonts/opentype/noto/"
    "NotoSansCJK-Regular.ttc"
)

FONT_FALLBACK_PATHS = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
)


def load_font(size):
    """利用できるフォントを読み込み、なければPillow既定へ戻す。"""

    for font_path in (FONT_PATH, *FONT_FALLBACK_PATHS):
        if not os.path.isfile(font_path):
            continue

        try:
            return ImageFont.truetype(
                font_path,
                size,
            )
        except OSError:
            continue

    print(
        "警告: 指定フォントがないため既定フォントを使用します。",
        flush=True,
    )
    return ImageFont.load_default()


def send_detected_stamp(qr_text, detected_ns):
    """QR認識結果をCloud Runへ送り、スマートフォンACKまで待つ。"""

    try:
        result = send_stamp(
            qr_text,
            timeout=STAMP_REQUEST_TIMEOUT_SECONDS,
        )
    except (ValueError, StampRequestError) as error:
        return {
            "ok": False,
            "error": str(error),
        }

    qr_detect_to_ack_ms = (
        time.perf_counter_ns() - detected_ns
    ) / 1_000_000

    return {
        "ok": True,
        "result": result,
        "qr_detect_to_ack_ms": qr_detect_to_ack_ms,
    }


def print_stamp_result(stamp_response):
    """Cloud Run通信の結果と各区間のレイテンシーを表示する。"""

    print(
        "================================",
        flush=True,
    )

    if not stamp_response["ok"]:
        print(
            f"スタンプ送信失敗: {stamp_response['error']}",
            flush=True,
        )
        print(
            "スマートフォンの接続を確認して再試行してください。",
            flush=True,
        )
        print(
            "================================",
            flush=True,
        )
        return

    result = stamp_response["result"]
    browser_ms = result.browser_receive_to_ack_ms
    browser_text = (
        f"{browser_ms:.1f} ms"
        if browser_ms is not None
        else "n/a"
    )

    print("STAMP ACK受信", flush=True)
    print(
        "QR認識完了 -> スマホACK: "
        f"{stamp_response['qr_detect_to_ack_ms']:.1f} ms",
        flush=True,
    )
    print(
        "Pi POST開始 -> レスポンス: "
        f"{result.pi_request_to_response_ms:.1f} ms",
        flush=True,
    )
    print(
        "Cloud Run送信 -> スマホACK: "
        f"{result.server_emit_to_ack_ms:.1f} ms",
        flush=True,
    )
    print(
        "ブラウザ受信 -> ACK送信開始: "
        f"{browser_text}",
        flush=True,
    )
    print(
        f"event_id: {result.event_id}",
        flush=True,
    )
    print(
        "================================",
        flush=True,
    )


def center_square(frame):
    """映像中央を正方形に切り抜く。"""
    height, width = frame.shape[:2]
    side = min(width, height)

    x = (width - side) // 2
    y = (height - side) // 2

    return frame[y:y + side, x:x + side]


def frame_to_lcd_image(frame):
    """カメラ画像を240×240のPIL画像に変換する。"""
    image = Image.fromarray(frame)

    image = image.resize(
        (LCD_SIZE, LCD_SIZE),
        Image.Resampling.BILINEAR,
    )

    # カメラの取り付け向きの補正（反時計回りに90度）
    return image.rotate(90)


def create_qr_result_image(qr_text):
    """QR読み取り成功画面を作る。"""
    image = Image.new(
        "RGB",
        (LCD_SIZE, LCD_SIZE),
        (0, 120, 40),
    )

    draw = ImageDraw.Draw(image)

    title_font = load_font(28)

    text_font = load_font(16)

    draw.text(
        (LCD_SIZE // 2, 38),
        "QR READ",
        font=title_font,
        fill="white",
        anchor="mm",
    )

    display_text = qr_text.replace(
        "\r",
        " ",
    ).replace(
        "\n",
        " ",
    )

    if len(display_text) > 80:
        display_text = display_text[:77] + "..."

    lines = textwrap.wrap(
        display_text,
        width=20,
        break_long_words=True,
        break_on_hyphens=False,
    )

    message = "\n".join(lines[:5])

    draw.multiline_text(
        (LCD_SIZE // 2, 85),
        message,
        font=text_font,
        fill="white",
        anchor="ma",
        align="center",
        spacing=5,
    )

    return image


def main():
    picam2 = None
    display = None
    stamp_executor = None

    try:
        # LCD設定
        cs = digitalio.DigitalInOut(board.CE0)
        dc = digitalio.DigitalInOut(board.D25)
        rst = digitalio.DigitalInOut(board.D27)

        display = gc9a01a.GC9A01A(
            board.SPI(),
            cs=cs,
            dc=dc,
            rst=rst,
            width=LCD_SIZE,
            height=LCD_SIZE,
            rotation=0,
            baudrate=24_000_000,
        )

        # カメラ設定
        picam2 = Picamera2()

        camera_config = (
            picam2.create_video_configuration(
                main={
                    "format": "RGB888",
                    "size": (
                        CAMERA_WIDTH,
                        CAMERA_HEIGHT,
                    ),
                },
                controls={
                    "FrameRate": CAMERA_FPS,
                },
                buffer_count=4,
            )
        )

        picam2.configure(camera_config)

        qr_detector = cv2.QRCodeDetector()

        last_qr_text = None
        last_qr_time = 0.0
        frame_number = 0

        # 通信中も液晶プレビューを止めないための送信ワーカー
        stamp_executor = ThreadPoolExecutor(
            max_workers=1,
            thread_name_prefix="stamp-sender",
        )
        stamp_future = None

        picam2.start()

        # 自動露出とホワイトバランスを待つ
        time.sleep(1)

        print(
            "QR読み取りを開始しました。",
            flush=True,
        )

        while True:
            # バックグラウンド通信の完了結果を表示
            if (
                stamp_future is not None
                and stamp_future.done()
            ):
                try:
                    print_stamp_result(
                        stamp_future.result()
                    )
                except Exception as error:
                    print(
                        f"スタンプ処理エラー: {error}",
                        flush=True,
                    )

                stamp_future = None

            frame = picam2.capture_array("main")

            # 液晶に映る中央部分だけを使用
            square_frame = center_square(frame)

            frame_number += 1
            qr_text = ""
            points = None

            # 毎フレーム解析すると重いため間引く
            if frame_number % QR_SCAN_INTERVAL == 0:
                gray = cv2.cvtColor(
                    square_frame,
                    cv2.COLOR_RGB2GRAY,
                )

                qr_text, points, _ = (
                    qr_detector.detectAndDecode(gray)
                )

            # 認識したQRを緑枠で囲む
            if points is not None:
                polygon = np.int32(
                    points
                ).reshape(-1, 2)

                cv2.polylines(
                    square_frame,
                    [polygon],
                    isClosed=True,
                    color=(0, 255, 0),
                    thickness=4,
                )

            current_time = time.monotonic()

            if qr_text:
                is_new_qr = (
                    qr_text != last_qr_text
                    or current_time - last_qr_time
                    >= QR_RESCAN_SECONDS
                )

                if is_new_qr:
                    last_qr_text = qr_text
                    last_qr_time = current_time

                    if stamp_future is None:
                        detected_ns = time.perf_counter_ns()
                        stamp_future = stamp_executor.submit(
                            send_detected_stamp,
                            qr_text,
                            detected_ns,
                        )

                        print(
                            "Cloud Runへスタンプを送信します: "
                            f"{qr_text}",
                            flush=True,
                        )
                    else:
                        print(
                            "前回のスタンプ送信が処理中のため、"
                            "今回の送信を省略します。",
                            flush=True,
                        )

                    print(
                        f"QR読み取り成功: {qr_text}",
                        flush=True,
                    )

                    result_image = (
                        create_qr_result_image(qr_text)
                    )

                    display.image(result_image)
                    time.sleep(QR_MESSAGE_SECONDS)

                    continue

            # 通常時はリアルタイム映像を表示
            lcd_image = frame_to_lcd_image(
                square_frame
            )

            display.image(lcd_image)

    except KeyboardInterrupt:
        print(
            "\nCtrl+Cで終了します。",
            flush=True,
        )

    except Exception as error:
        print(
            f"エラーが発生しました: {error}",
            flush=True,
        )

    finally:
        if picam2 is not None:
            try:
                picam2.stop()
                picam2.close()
            except Exception:
                pass

        if display is not None:
            try:
                display.image(
                    Image.new(
                        "RGB",
                        (LCD_SIZE, LCD_SIZE),
                        "black",
                    )
                )
            except Exception:
                pass

        if stamp_executor is not None:
            stamp_executor.shutdown(
                wait=True,
                cancel_futures=True,
            )

        cv2.destroyAllWindows()

        print(
            "カメラを終了しました。",
            flush=True,
        )


if __name__ == "__main__":
    main()
