"""スタンプ機プロセスのエントリーポイント。"""

from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path

from .app import StampDeviceApp
from .config import load_config
from .hardware import create_hardware
from .http_client import UrllibDeviceApi
from .interfaces import QrDecoder
from .queue import PersistentStampQueue
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
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=args.log_level, format="%(asctime)s %(levelname)s %(message)s")
    config = load_config(args.config)
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
        api=UrllibDeviceApi(config.server_url, config.api_key),
        queue=PersistentStampQueue(config.queue_file),
        device_id=config.device_id,
        spot_id=config.spot_id,
        stamp_directory=assets,
    )
    app.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
