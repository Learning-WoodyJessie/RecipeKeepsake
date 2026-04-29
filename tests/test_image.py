from unittest.mock import patch, MagicMock
from prompts.image import generate_dish_image, IMAGE_PROMPT_TEMPLATE


class TestGenerateDishImage:
    def test_returns_url_string(self):
        """generate_dish_image() returns the URL from DALL-E response."""
        mock_response = MagicMock()
        mock_response.data[0].url = "https://dalle.openai.com/img/pesarattu.png"

        with patch("prompts.image.OpenAI") as mock_openai:
            mock_openai.return_value.images.generate.return_value = mock_response
            result = generate_dish_image("Pesarattu")

        assert result == "https://dalle.openai.com/img/pesarattu.png"

    def test_uses_dalle3_model(self):
        """generate_dish_image() uses dall-e-3, not dall-e-2."""
        mock_response = MagicMock()
        mock_response.data[0].url = "https://dalle.openai.com/img/test.png"

        with patch("prompts.image.OpenAI") as mock_openai:
            mock_client = mock_openai.return_value
            mock_client.images.generate.return_value = mock_response
            generate_dish_image("Pesarattu")
            call_kwargs = mock_client.images.generate.call_args[1]

        assert call_kwargs["model"] == "dall-e-3"

    def test_prompt_includes_dish_name(self):
        """generate_dish_image() includes the dish name in the DALL-E prompt."""
        mock_response = MagicMock()
        mock_response.data[0].url = "https://dalle.openai.com/img/test.png"

        with patch("prompts.image.OpenAI") as mock_openai:
            mock_client = mock_openai.return_value
            mock_client.images.generate.return_value = mock_response
            generate_dish_image("Gongura Pachadi")
            call_kwargs = mock_client.images.generate.call_args[1]

        assert "Gongura Pachadi" in call_kwargs["prompt"]

    def test_prompt_template_contains_south_indian_context(self):
        """IMAGE_PROMPT_TEMPLATE includes South Indian food context for accurate images."""
        assert "south indian" in IMAGE_PROMPT_TEMPLATE.lower() or \
               "indian" in IMAGE_PROMPT_TEMPLATE.lower()
