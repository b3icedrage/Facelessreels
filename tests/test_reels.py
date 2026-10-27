import json
import tempfile
import unittest
from pathlib import Path
from facelessreels.reels import build_scenes, write_pack, slugify

class ReelGeneratorTests(unittest.TestCase):
    def test_scenes_cover_requested_duration(self):
        scenes = build_scenes("budget cooking", "educational", 30)
        self.assertEqual(len(scenes), 6)
        self.assertEqual(scenes[0]["start"], 0)
        self.assertEqual(scenes[-1]["end"], 30)
        self.assertEqual(sum(s["duration"] for s in scenes), 30)

    def test_rejects_invalid_duration_and_topic(self):
        with self.assertRaises(ValueError):
            build_scenes("topic", "educational", 10)
        with self.assertRaises(ValueError):
            build_scenes("  ", "educational", 30)

    def test_supported_styles(self):
        for style in ("educational", "story", "listicle"):
            self.assertEqual(len(build_scenes("study habits", style, 15)), 6)

    def test_writes_draft_pack_without_paid_or_publish_actions(self):
        with tempfile.TemporaryDirectory() as temp:
            output = str(Path(temp) / "draft")
            result = write_pack("phone photography", output, "listicle", 30)
            self.assertFalse(result["rendered"])
            self.assertFalse(result["paid_actions_enabled"])
            self.assertFalse(result["publishing_enabled"])
            for name in ("script.txt", "voiceover.txt", "captions.srt", "reel.json", "visual_prompts.txt"):
                self.assertTrue((Path(output) / name).is_file(), name)
            data = json.loads((Path(output) / "reel.json").read_text())
            self.assertEqual(data["duration_seconds"], 30)
            self.assertFalse(data["publishing_enabled"])

    def test_refuses_to_overwrite_existing_output(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "existing"
            output.mkdir()
            (output / "keep.txt").write_text("do not overwrite")
            with self.assertRaisesRegex(ValueError, "already exists"):
                write_pack("topic", str(output))
            self.assertEqual((output / "keep.txt").read_text(), "do not overwrite")

    def test_slugify(self):
        self.assertEqual(slugify("How to Save Money!"), "how-to-save-money")

if __name__ == "__main__":
    unittest.main()
