from unittest.mock import MagicMock


def provider(response_text: str):
    """Build a mock LLMProvider that returns response_text from .generate()."""
    mock = MagicMock()
    mock.generate.return_value = response_text
    return mock
