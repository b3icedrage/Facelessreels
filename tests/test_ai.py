import json
import os
import unittest
from unittest.mock import patch

from facelessreels.ai import generate_ai_scenes


def provider_response():
    scenes = []
    for label in ("HOOK", "SETUP", "POINT 1", "POINT 2", "POINT 3", "CTA"):
        scenes.append({
            "label": label,
            "narration": f"Useful narration for {label.lower()}.",
            "on_screen_text": f"{label}: remember this",
            "visual_prompt": "Original faceless vertical background footage, no logos or readable text.",
        })
    body = {"choices": [{"message": {"content": json.dumps({"title": "A useful reel", "scenes": scenes})}}]}
    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self, limit): return json.dumps(body).encode("utf-8")
    return Response()


class AIProviderTests(unittest.TestCase):
    def test_requires_explicitly_configured_api_key(self):
        with patch.dict(os.environ, {"NVIDIA_API_KEY": "", "OPENAI_API_KEY": ""}):
            with self.assertRaisesRegex(ValueError, "requires NVIDIA_API_KEY"):
                generate_ai_scenes("study tips", "educational", 30)

    def test_parses_structured_ai_response_and_sets_timing_locally(self):
        with patch.dict(os.environ, {"NVIDIA_API_KEY": "test-key", "FACELESSREELS_AI_BASE_URL": "https://integrate.api.nvidia.com/v1/chat/completions"}):
            with patch("urllib.request.urlopen", return_value=provider_response()) as mocked:
                scenes = generate_ai_scenes("study tips", "educational", 30, "test-model")
        self.assertEqual(len(scenes), 6)
        self.assertEqual(scenes[0]["label"], "HOOK")
        self.assertEqual(scenes[0]["start"], 0)
        self.assertEqual(scenes[-1]["end"], 30)
        self.assertEqual(sum(scene["duration"] for scene in scenes), 30)
        request = mocked.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(payload["model"], "test-model")
        self.assertEqual(request.full_url, "https://integrate.api.nvidia.com/v1/chat/completions")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-key")
        self.assertEqual(payload["response_format"]["type"], "json_object")
        self.assertEqual(mocked.call_args.kwargs["timeout"], 45)

    def test_rejects_invalid_scene_count(self):
        body = {"choices": [{"message": {"content": json.dumps({"scenes": []})}}]}
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, limit): return json.dumps(body).encode("utf-8")
        with patch.dict(os.environ, {"NVIDIA_API_KEY": "test-key"}):
            with patch("urllib.request.urlopen", return_value=Response()):
                with self.assertRaisesRegex(ValueError, "exactly six scenes"):
                    generate_ai_scenes("study tips", "educational", 30)


if __name__ == "__main__":
    unittest.main()
