#!/usr/bin/env python3
"""Piで読み取ったQR値をCloud Runへ送り、スマートフォンACKまで計測する。"""

from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass


DEFAULT_BASE_URL = (
    "https://hcd-stamp-latency-test-667376658268."
    "asia-northeast1.run.app"
)


@dataclass(frozen=True)
class StampResult:
    client_id: str
    event_id: str
    pi_request_to_response_ms: float
    server_emit_to_ack_ms: float
    browser_receive_to_ack_ms: float | None


class StampRequestError(RuntimeError):
    """Cloud Runへのスタンプ送信が完了しなかった。"""


def send_stamp(
    client_id: str,
    *,
    base_url: str = DEFAULT_BASE_URL,
    timeout: float = 10.0,
) -> StampResult:
    """QR値を送信し、Cloud RunがスマートフォンACKを返すまで待つ。"""
    client_id = client_id.strip()
    if not client_id:
        raise ValueError("client_idが空です")

    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/stamp",
        data=json.dumps({"client_id": client_id}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    started_ns = time.perf_counter_ns()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        if error.code == 409:
            raise StampRequestError(
                "対象スマートフォンがSSE接続されていません"
            ) from error
        raise StampRequestError(f"HTTP {error.code}: {body}") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise StampRequestError(f"Cloud Runへの通信に失敗しました: {error}") from error

    finished_ns = time.perf_counter_ns()
    pi_elapsed_ms = (finished_ns - started_ns) / 1_000_000

    if not payload.get("ok"):
        raise StampRequestError(str(payload.get("error", payload)))

    browser_raw = payload.get("browser_receive_to_ack_ms")
    return StampResult(
        client_id=client_id,
        event_id=str(payload["event_id"]),
        pi_request_to_response_ms=round(pi_elapsed_ms, 1),
        server_emit_to_ack_ms=float(payload["server_emit_to_ack_ms"]),
        browser_receive_to_ack_ms=(
            float(browser_raw) if browser_raw is not None else None
        ),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="QR値をCloud Runへ送り、スマートフォンACKまで計測します。"
    )
    parser.add_argument(
        "client_id",
        nargs="?",
        default="test-user-1",
        help="QRから読み取った値（既定: test-user-1）",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Cloud Run URL（既定: {DEFAULT_BASE_URL}）",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=10.0,
        help="HTTPタイムアウト秒数（既定: 10）",
    )
    args = parser.parse_args()

    parsed_url = urllib.parse.urlparse(args.base_url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        parser.error("--base-urlはhttp://またはhttps://から始めてください")
    if args.timeout <= 0:
        parser.error("--timeoutは0より大きくしてください")
    return args


def main() -> int:
    args = parse_args()
    try:
        result = send_stamp(
            args.client_id,
            base_url=args.base_url,
            timeout=args.timeout,
        )
    except (ValueError, StampRequestError) as error:
        print(f"送信失敗: {error}")
        return 1

    print("STAMP ACK受信")
    print(f"  client_id:                   {result.client_id}")
    print(f"  event_id:                    {result.event_id}")
    print(
        "  Pi request -> response:      "
        f"{result.pi_request_to_response_ms:.1f} ms"
    )
    print(
        "  Cloud Run emit -> ACK:       "
        f"{result.server_emit_to_ack_ms:.1f} ms"
    )
    browser_text = (
        f"{result.browser_receive_to_ack_ms:.1f} ms"
        if result.browser_receive_to_ack_ms is not None
        else "n/a"
    )
    print(f"  Browser receive -> ACK send: {browser_text}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
