from unittest.mock import MagicMock, patch
from prompts.llm import LLMProvider, OpenAIProvider


class TestLLMProvider:
    def test_is_abstract(self):
        """LLMProvider cannot be instantiated directly."""
        import pytest
        with pytest.raises(TypeError):
            LLMProvider()


class TestOpenAIProvider:
    def test_generate_returns_string(self):
        """generate() calls the OpenAI chat API and returns content string."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "translated text"

        with patch("prompts.llm.OpenAI") as mock_openai:
            mock_openai.return_value.chat.completions.create.return_value = mock_response
            p = OpenAIProvider(model="gpt-4o")
            result = p.generate(system="sys prompt", user="user input")

        assert result == "translated text"

    def test_generate_passes_correct_messages(self):
        """generate() sends system + user messages in the right structure."""
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "result"

        with patch("prompts.llm.OpenAI") as mock_openai:
            mock_client = mock_openai.return_value
            mock_client.chat.completions.create.return_value = mock_response
            p = OpenAIProvider(model="gpt-4o")
            p.generate(system="be a chef", user="translate this")

            call_kwargs = mock_client.chat.completions.create.call_args[1]
            messages = call_kwargs["messages"]

        assert messages[0] == {"role": "system", "content": "be a chef"}
        assert messages[1] == {"role": "user", "content": "translate this"}
