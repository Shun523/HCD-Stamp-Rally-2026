"""設定ファイルの読み込み。"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class DeviceConfig:
    """設定ファイルで指定する機体固有の値。"""

    server_url: str
    api_key: str
    device_id: str
    spot_id: str
    queue_file: Path
    hardware_backend: str


def _require_string(section: dict[str, object], key: str, section_name: str) -> str:
    value = section.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"[{section_name}].{key} は空でない文字列にしてください")
    return value.strip()


def _section(raw: dict[str, object], name: str) -> dict[str, object]:
    value = raw.get(name)
    if not isinstance(value, dict):
        raise ValueError(f"[{name}] セクションがありません")
    return value


def load_config(path: Path) -> DeviceConfig:
    """TOMLからサーバーURL・APIキー・機体ID・スポットIDを読む（仕様6-8）。"""

    with path.open("rb") as file:
        raw = tomllib.load(file)

    server = _section(raw, "server")
    device = _section(raw, "device")
    storage = _section(raw, "storage")
    hardware = _section(raw, "hardware")
    backend = _require_string(hardware, "backend", "hardware")
    if backend not in {"auto", "dummy", "pi"}:
        raise ValueError("[hardware].backend は auto、dummy、pi のいずれかにしてください")
    spot_id = _require_string(device, "spot_id", "device")
    if spot_id not in {f"spot-{index:02d}" for index in range(1, 6)}:
        raise ValueError("[device].spot_id は spot-01〜spot-05 のいずれかにしてください")

    return DeviceConfig(
        server_url=_require_string(server, "base_url", "server").rstrip("/"),
        api_key=_require_string(server, "api_key", "server"),
        device_id=_require_string(device, "id", "device"),
        spot_id=spot_id,
        queue_file=Path(_require_string(storage, "queue_file", "storage")),
        hardware_backend=backend,
    )
