from openai import OpenAI

IMAGE_PROMPT_TEMPLATE = (
    "A beautiful, appetizing close-up photograph of {dish_name}, "
    "a traditional South Indian dish. "
    "Warm natural lighting, rustic wooden surface, authentic home-cooked presentation. "
    "Vibrant colours, sharp focus. No text, no watermarks, no people."
)


def generate_dish_image(dish_name: str) -> str:
    """Call DALL-E 3 with dish name. Returns the generated image URL.
    Note: URL expires after ~1hr — caller must download and re-upload to Supabase Storage.
    """
    client = OpenAI()
    prompt = IMAGE_PROMPT_TEMPLATE.format(dish_name=dish_name)
    response = client.images.generate(
        model="dall-e-3",
        prompt=prompt,
        size="1024x1024",
        quality="standard",
        n=1,
    )
    return response.data[0].url
