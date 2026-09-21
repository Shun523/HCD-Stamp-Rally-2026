from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from hcd_stamp_device.config import load_config


class ConfigTests(unittest.TestCase):
    def test_loads_required_device_settings(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "device.toml"
            config_path.write_text(
                """
[server]
base_url = "https://stamp.example/"
api_key = "secret"
[device]
id = "dev-01"
spot_id = "spot-03"
[storage]
queue_file = "/tmp/queue.json"
[hardware]
backend = "dummy"
""".strip(),
                encoding="utf-8",
            )
            config = load_config(config_path)

        self.assertEqual(config.server_url, "https://stamp.example")
        self.assertEqual(config.device_id, "dev-01")
        self.assertEqual(config.spot_id, "spot-03")
        self.assertEqual(config.hardware_backend, "dummy")

    def test_rejects_unknown_hardware_backend(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "device.toml"
            config_path.write_text(
                """
[server]
base_url = "https://stamp.example"
api_key = "secret"
[device]
id = "dev-01"
spot_id = "spot-01"
[storage]
queue_file = "/tmp/queue.json"
[hardware]
backend = "wrong"
""".strip(),
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                load_config(config_path)
