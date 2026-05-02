from abc import ABC, abstractmethod
from openai import OpenAI


class LLMProvider(ABC):
    @abstractmethod
    def generate(self, system: str, user: str) -> str: ...


class OpenAIProvider(LLMProvider):
    def __init__(self, model: str = "gpt-4o"):
        self.model = model
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = OpenAI()
        return self._client

    def generate(self, system: str, user: str, json_mode: bool = False) -> str:
        kwargs = dict(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        response = self.client.chat.completions.create(**kwargs)
        return response.choices[0].message.content
