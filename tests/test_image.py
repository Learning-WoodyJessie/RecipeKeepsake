from unittest.mock import patch, MagicMock
from prompts.image import generate_dish_image, _build_prompt, _extract_visual_details


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


class TestExtractVisualDetails:
    def test_detects_colour_bearing_ingredient(self):
        """Key colour-bearing ingredients are extracted from ingredient list."""
        ingredients = [{"item": "turmeric", "quantity": "1/2 tsp"}, {"item": "onion", "quantity": "2"}]
        details = _extract_visual_details("Curry", ingredients, [], "")
        assert "turmeric" in details["key_ingredients"]

    def test_vessel_from_dish_name(self):
        """Vessel is inferred from dish name keyword."""
        details = _extract_visual_details("Hyderabadi Biryani", [], [], "")
        assert "handi" in details["vessel"]

    def test_vessel_defaults_to_earthen_bowl(self):
        """Vessel defaults to earthen bowl when no keyword matches."""
        details = _extract_visual_details("Mystery Dish", [], [], "")
        assert "earthen" in details["vessel"]

    def test_region_from_dish_name(self):
        """Regional cue is extracted from dish name."""
        details = _extract_visual_details("Chettinad Chicken Curry", [], [], "")
        assert "Chettinad" in details["region"]

    def test_region_defaults_to_south_indian(self):
        """Region defaults to South Indian when no keyword matches."""
        details = _extract_visual_details("Some Dish", [], [], "")
        assert "South Indian" in details["region"]

    def test_garnish_from_steps(self):
        """Garnish is detected from step text."""
        steps = ["Add coriander at the end", "Serve hot"]
        details = _extract_visual_details("Dal", [], steps, "")
        assert "coriander" in details["garnish"]

    def test_texture_from_cook_notes(self):
        """Texture hint is extracted from cook_notes."""
        details = _extract_visual_details("Dosa", [], [], "Make the batter thick and smooth")
        assert details["texture"] != ""

    def test_banana_leaf_from_steps_overrides_vessel_cue(self):
        """Explicit 'banana leaf' in steps wins over dish-name vessel cue."""
        steps = ["Serve on a banana leaf with chutney"]
        details = _extract_visual_details("Idli Sambar", [], steps, "")
        assert "banana leaf" in details["vessel"]


class TestBuildPrompt:
    def test_prompt_includes_dish_name(self):
        prompt = _build_prompt("Pesarattu")
        assert "Pesarattu" in prompt

    def test_prompt_includes_key_ingredient(self):
        ingredients = [{"item": "saffron", "quantity": "a pinch"}]
        prompt = _build_prompt("Biryani", ingredients=ingredients)
        assert "saffron" in prompt

    def test_prompt_has_no_text_watermark_rule(self):
        prompt = _build_prompt("Any Dish")
        assert "No text" in prompt

    def test_prompt_enriched_with_all_fields(self):
        """Full enrichment path produces a longer, richer prompt than dish-name only."""
        bare = _build_prompt("Hyderabadi Biryani")
        rich = _build_prompt(
            "Hyderabadi Biryani",
            ingredients=[{"item": "saffron", "quantity": "a pinch"}, {"item": "turmeric", "quantity": "1/2 tsp"}],
            steps=["Layer rice and meat", "Garnish with fried onion and coriander"],
            cook_notes="The gravy should be thick and rich.",
        )
        assert len(rich) > len(bare)
        assert "saffron" in rich
        assert "Hyderabadi" in rich
