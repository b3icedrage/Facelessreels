import json
import tempfile
import unittest
from pathlib import Path

from facelessreels.kids_studio import PROFILE, build_episode, write_episode


class KidsStudioTests(unittest.TestCase):
    def test_profile_defaults_match_channel(self):
        self.assertEqual(PROFILE["audience"], "5-8 years")
        self.assertEqual(PROFILE["language"], "English")
        self.assertEqual(PROFILE["genre"], "funny adventures")
        self.assertEqual(PROFILE["duration_default_seconds"], 240)

    def test_episode_has_nine_timed_beats(self):
        episode = build_episode("A squirrel loses a map", 240)
        self.assertEqual(episode["scene_count"], 9)
        self.assertEqual(episode["scenes"][0]["start_seconds"], 0)
        self.assertEqual(episode["scenes"][-1]["end_seconds"], 240)
        self.assertFalse(episode["youtube_uploaded"])
        self.assertFalse(episode["paid_actions_enabled"])

    def test_rejects_duration_outside_three_to_five_minutes(self):
        with self.assertRaises(ValueError):
            build_episode("A funny adventure", 120)
        with self.assertRaises(ValueError):
            build_episode("A funny adventure", 360)

    def test_writes_blueprint_files_and_prevents_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "episode"
            write_episode("Two friends find a silly mystery", str(target), 210)
            expected = {
                "episode_blueprint.json", "episode_script.md", "story_outline.md", "visual_prompts.md",
                "character_bible.md", "youtube_upload_checklist.md",
            }
            self.assertEqual({p.name for p in target.iterdir()}, expected)
            data = json.loads((target / "episode_blueprint.json").read_text(encoding="utf-8"))
            self.assertEqual(data["duration_seconds"], 210)
            self.assertEqual(data["generation_mode"], "offline_fallback")
            self.assertEqual(len(data["characters"]), 2)
            self.assertTrue((target / "episode_script.md").stat().st_size > 0)
            with self.assertRaises(ValueError):
                write_episode("Another story", str(target), 240)


if __name__ == "__main__":
    unittest.main()
