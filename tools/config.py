"""Shared config loader. Both scripts/serve.py and scripts/capture.py use this."""
from pathlib import Path
import yaml

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "config.yaml"


def load_config() -> dict:
    """Load data/config.yaml and return the parsed dict."""
    with open(_CONFIG_PATH) as f:
        return yaml.safe_load(f)
