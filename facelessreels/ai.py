"""Opt-in OpenAI-compatible script generation. No network request occurs on import."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


DEFAULT_MODEL = os.environ.get("FACELESSREELS_AI_MODEL", "gpt-4o-mini")
API_URL = os.environ.get("FACELESSREELS_AI_BASE_URL", "https://api.openai.com/v1/chat/completions")


def generate_ai_scenes(topic: str, style: str, duration: int, model: str | None = None) -> list[dict]:
    """Request a structured six-scene draft. Calling this function may incur API charges."""
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise ValueError("AI mode requires OPENAI_API_KEY. Set it only if you approve potential API charges.")
    chosen_model = (model or DEFAULT_MODEL).strip()
    if not chosen_model or len(chosen_model) > 120:
        raise ValueError("model name must contain 1–120 characters")
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
        API_URL,
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
