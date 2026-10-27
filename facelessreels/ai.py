"""Opt-in NVIDIA NIM (default) or OpenAI-compatible AI script generation.

No network request occurs on import. Requests happen only when the user passes --ai.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

DEFAULT_PROVIDER = os.environ.get("FACELESSREELS_AI_PROVIDER", "nvidia").strip().lower()
if DEFAULT_PROVIDER not in {"nvidia", "openai"}:
    DEFAULT_PROVIDER = "nvidia"

_DEFAULT_MODELS = {
    "nvidia": "meta/llama-3.1-8b-instruct",
    "openai": "gpt-4o-mini",
}
_DEFAULT_URLS = {
    "nvidia": "https://integrate.api.nvidia.com/v1/chat/completions",
    "openai": "https://api.openai.com/v1/chat/completions",
}
DEFAULT_MODEL = os.environ.get("FACELESSREELS_AI_MODEL", _DEFAULT_MODELS[DEFAULT_PROVIDER])


def generate_ai_scenes(
    topic: str,
    style: str,
    duration: int,
    model: str | None = None,
    provider: str | None = None,
) -> list[dict]:
    """Request a structured six-scene draft. The explicit API call may be billable."""
    chosen_provider = (provider or DEFAULT_PROVIDER).strip().lower()
    if chosen_provider not in _DEFAULT_URLS:
        raise ValueError("provider must be 'nvidia' or 'openai'")

    key_name = "NVIDIA_API_KEY" if chosen_provider == "nvidia" else "OPENAI_API_KEY"
    api_key = os.environ.get(key_name, "").strip()
    if not api_key:
        raise ValueError(
            f"AI mode requires {key_name}. Set it locally only after reviewing the provider's "
            "pricing, usage limits, and terms."
        )

    chosen_model = (model or os.environ.get("FACELESSREELS_AI_MODEL", _DEFAULT_MODELS[chosen_provider])).strip()
    if not chosen_model or len(chosen_model) > 120:
        raise ValueError("model name must contain 1–120 characters")

    api_url = os.environ.get("FACELESSREELS_AI_BASE_URL", _DEFAULT_URLS[chosen_provider]).strip()
    if not api_url.startswith("https://"):
        raise ValueError("AI endpoint must use HTTPS")
    system_prompt = (
        "You are a careful short-form video scriptwriter. Return only valid JSON matching "
        '{"title":"string","scenes":[{"label":"string","narration":"string",'
        '"on_screen_text":"string","visual_prompt":"string"}]}. '
        "Exactly six scenes: HOOK, SETUP, POINT 1, POINT 2, POINT 3, CTA. "
        "Use original wording, useful specific advice, a compelling but honest hook, and a natural CTA. "
        "Avoid fabricated statistics, guaranteed income claims, medical/legal/financial certainty, "
        "copyrighted character imitation, brands/logos, readable text in visual prompts, and deceptive claims. "
        "Visual prompts must describe original faceless 9:16 imagery suitable as background footage. "
        "Keep narration concise enough for the requested duration. Do not include markdown."
    )
    user_prompt = (
        f"Topic: {topic}\nStyle: {style}\nTarget duration: {duration} seconds. "
        "Create six concise scenes with narration, short on-screen text, and a visual prompt. "
        "The CTA must not promise results."
    )
    payload = {
        "model": chosen_model,
        "temperature": 0.7,
        "max_tokens": 1800,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    request = urllib.request.Request(
        api_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            response_data = json.loads(response.read(1_000_000).decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read(1200).decode("utf-8", errors="replace")
        raise ValueError(f"AI provider returned HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise ValueError(f"AI provider connection failed: {exc.reason}") from exc
    except (TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError(f"AI provider response could not be read: {exc}") from exc

    try:
        raw = response_data["choices"][0]["message"]["content"]
        data = json.loads(raw)
        raw_scenes = data["scenes"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("AI provider returned invalid structured content; no files were written") from exc
    if not isinstance(raw_scenes, list) or len(raw_scenes) != 6:
        raise ValueError("AI provider must return exactly six scenes; no files were written")

    expected_labels = ["HOOK", "SETUP", "POINT 1", "POINT 2", "POINT 3", "CTA"]
    scenes = []
    weights = [1.25, 0.75, 1.0, 1.0, 1.0, 1.0]
    lengths = [round(duration * weight / sum(weights)) for weight in weights]
    lengths[-1] += duration - sum(lengths)
    cursor = 0
    for index, (item, label, seconds) in enumerate(zip(raw_scenes, expected_labels, lengths), start=1):
        if not isinstance(item, dict):
            raise ValueError("AI scene must be an object; no files were written")
        fields = {}
        for key, limit in (("narration", 600), ("on_screen_text", 240), ("visual_prompt", 1000)):
            value = item.get(key)
            if not isinstance(value, str):
                raise ValueError(f"AI scene is missing string field {key}; no files were written")
            value = " ".join(value.split()).strip()
            if not value or len(value) > limit:
                raise ValueError(f"AI field {key} must contain 1–{limit} characters; no files were written")
            fields[key] = value
        scenes.append({
            "index": index, "label": label, "start": cursor, "end": cursor + seconds,
            "duration": seconds, **fields,
        })
        cursor += seconds
    return scenes
