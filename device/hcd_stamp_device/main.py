"""スタンプ機プロセスのエントリーポイント。"""

from __future__ import annotations

import argparse
import logging
import os
from datetime import UTC, datetime
from pathlib import Path

from .app import StampDeviceApp
from .config import load_config
from .hardware import create_hardware
from .http_client import DeviceApi, UrllibDeviceApi
from .interfaces import QrDecoder
from .models import SendResult
from .queue import PersistentStampQueue
from .sender import SenderWorker
from .vision import NoopQrDecoder, OpenCvQrDecoder


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="HCDデジタルスタンプラリー・スタンプ機")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(os.environ.get("DEVICE_CONFIG", "/etc/hcd-stamp-device/config.toml")),
        help="設定TOMLのパス（既定: DEVICE_CONFIG または /etc/hcd-stamp-device/config.toml）",
    )
    parser.add_argument(
        "--log-level", default="INFO", choices=("DEBUG", "INFO", "WARNING", "ERROR")
    )
    simulation = parser.add_mutually_exclusive_group()
    simulation.add_argument(
        "--simulate-token",
        help="カメラを使わず指定トークンを1回送信する開発・E2E用モード",
    )
    simulation.add_argument(
        "--simulate-resend",
        action="store_true",
        help="永続化済みキューの最古の1件をカメラなしで再送する開発・E2E用モード",
    )
    return parser.parse_args()


def send_simulated_token(
    api: DeviceApi,
    queue: PersistentStampQueue,
    device_id: str,
    token: str,
) -> SendResult:
    """指定トークンを一度送信し、通信不能なら既存キューへ保存する（仕様6-3/6-7）。"""

    worker = SenderWorker(api, queue, device_id)
    if not worker.submit_detected(token, datetime.now(UTC)):
        raise RuntimeError("模擬端末の送信ワーカーを開始できませんでした")
    return worker.shutdown()[0]


def resend_simulated_stamp(
    api: DeviceApi,
    queue: PersistentStampQueue,
    device_id: str,
) -> SendResult | None:
    """再起動後の端末を模して、最古の永続化キューを一度だけ再送する（仕様6-7）。"""

    worker = SenderWorker(api, queue, device_id)
    if not worker.retry_oldest_once():
        worker.shutdown()
        return None
    return worker.shutdown()[0]


def log_simulation_result(result: SendResult | None) -> None:
    if result is None:
        logging.info("模擬端末: 再送するキューはありません")
        return
    logging.info(
        "模擬端末の送信結果: token=%s result=%s status=%s queued=%s",
        result.token,
        result.outcome.value,
        result.status,
        result.from_queue,
    )


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=args.log_level, format="%(asctime)s %(levelname)s %(message)s")
    config = load_config(args.config)
    api = UrllibDeviceApi(config.server_url, config.api_key)
    queue = PersistentStampQueue(config.queue_file)
    # 仕様6-3/6-7: 模擬端末はカメラ・液晶を初期化せず、本番と同じHTTP/永続キュー経路だけを通す。
    if args.simulate_token is not None:
        result = send_simulated_token(api, queue, config.device_id, args.simulate_token)
        log_simulation_result(result)
        return 0
    if args.simulate_resend:
        log_simulation_result(resend_simulated_stamp(api, queue, config.device_id))
        return 0

    camera, display = create_hardware(config.hardware_backend)
    try:
        decoder: QrDecoder = OpenCvQrDecoder()
    except ImportError:
        if config.hardware_backend == "pi":
            raise
        logging.warning("OpenCVがないため、ダミーQRデコーダーで起動します")
        decoder = NoopQrDecoder()
    assets = Path(__file__).with_name("assets") / "stamps"
    app = StampDeviceApp(
        camera=camera,
        display=display,
        decoder=decoder,
        api=api,
        queue=queue,
        device_id=config.device_id,
        spot_id=config.spot_id,
        stamp_directory=assets,
    )
    app.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
