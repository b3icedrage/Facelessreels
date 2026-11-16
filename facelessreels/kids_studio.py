"""Free-first, offline-first episode planner for the YouTube Kids cartoon profile.

This creates a production blueprint, not rendered 3D animation or a finished video.
No network requests, paid services, voice synthesis, rendering, or uploading occur.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

PROFILE = {
    "audience": "5-8 years",
    "duration_min_seconds": 180,
    "duration_default_seconds": 240,
    "duration_max_seconds": 300,
    "language": "English",
    "genre": "funny adventures",
    "visual_style": "original fully 3D cartoon",
    "aspect_ratio": "16:9",
    "youtube_audience": "Made for Kids",
}

BEATS = [
    ("COLD OPEN", 0.08, "Open with a funny visual surprise that makes the audience curious."),
    ("MEET THE HEROES", 0.10, "Introduce the recurring heroes, their personalities, and the setting."),
    ("THE FUNNY PROBLEM", 0.12, "A harmless, understandable problem interrupts an ordinary day."),
    ("ADVENTURE BEGINS", 0.12, "The friends choose a safe, kind way to solve the problem together."),
    ("COMEDIC OBSTACLE 1", 0.12, "The first attempt goes hilariously wrong without anyone getting hurt."),
    ("COMEDIC OBSTACLES 2 & 3", 0.16, "Two escalating but gentle mishaps teach the friends to listen and cooperate."),
    ("TEAMWORK SOLUTION", 0.18, "The heroes combine their strengths and solve the problem."),
    ("HAPPY PAYOFF", 0.08, "Celebrate the result with a warm, funny final gag."),
    ("GENTLE GOODBYE", 0.04, "End with a short positive thought and a friendly sign-off."),
]

def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:56].strip("-") or "kids-cartoon-episode"

def build_episode(idea: str, duration: int) -> dict:
    idea = " ".join(idea.split())
    if not idea or len(idea) > 220:
        raise ValueError("idea must contain 1-220 characters")
    if not PROFILE["duration_min_seconds"] <= duration <= PROFILE["duration_max_seconds"]:
        raise ValueError("duration must be between 180 and 300 seconds (3-5 minutes)")
    seconds = [round(duration * weight) for _, weight, _ in BEATS]
    seconds[-1] += duration - sum(seconds)
    scenes = []
    cursor = 0
    for index, ((name, _weight, direction), length) in enumerate(zip(BEATS, seconds), 1):
        scenes.append({
            "scene": index,
            "beat": name,
            "start_seconds": cursor,
            "end_seconds": cursor + length,
            "duration_seconds": length,
            "story_direction": direction,
            "story_idea": idea,
            "animation_direction": (
                "High-quality original 3D family-cartoon look; rounded appealing shapes; "
                "expressive faces; readable silhouettes; colourful, coherent environment; "
                "smooth character acting; gentle squash-and-stretch; cinematic but soft lighting; "
                "clear staging; no text, logos, or watermarks."
            ),
            "sound_direction": "English narrator and character dialogue, gentle original music, clear comedic sound effects.",
        })
        cursor += length
    return {
        "studio": "FacelessReels Kids Studio",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "idea": idea,
        "profile": PROFILE,
        "duration_seconds": duration,
        "scene_count": len(scenes),
        "scenes": scenes,
        "status": "blueprint_only",
        "rendered_video": False,
        "voiceover_generated": False,
        "youtube_uploaded": False,
        "paid_actions_enabled": False,
        "human_review_required": True,
    }

def write_episode(idea: str, output: str, duration: int) -> Path:
    episode = build_episode(idea, duration)
    destination = Path(output).expanduser()
    if destination.exists():
        raise ValueError(f"output folder already exists; choose a new folder: {destination}")
    destination.mkdir(parents=True)
    (destination / "episode_blueprint.json").write_text(
        json.dumps(episode, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    outline = [
        "# Episode story outline",
        "",
        f"**Premise:** {episode['idea']}",
        f"**Audience:** {PROFILE['audience']}  ",
        f"**Length:** {duration // 60} minutes {duration % 60} seconds  ",
        f"**Style:** {PROFILE['visual_style']}  ",
        "",
        "This is an offline planning scaffold. Expand each beat into original dialogue and action before animation.",
        "",
    ]
    prompts = ["# 3D scene and animation prompts", "",
               "Keep the same approved character designs, proportions, colours, clothing, and voices in every scene.",
               "Use the animation direction in the JSON blueprint as a consistent style guide.", ""]
    for scene in episode["scenes"]:
        timing = f"{scene['start_seconds']}–{scene['end_seconds']} sec"
        outline.extend([
            f"## {scene['scene']}. {scene['beat']} ({timing})",
            scene["story_direction"],
            f"Apply this to the premise: {episode['idea']}",
            "Dialogue/narration: write short, natural English sentences suitable for ages 5–8.",
            "",
        ])
        prompts.extend([
            f"## Scene {scene['scene']}: {scene['beat']}",
            f"Duration: {scene['duration_seconds']} seconds.",
            f"Action: {scene['story_direction']}",
            f"Premise: {episode['idea']}",
            f"Look and motion: {scene['animation_direction']}",
            f"Audio: {scene['sound_direction']}",
            "",
        ])
    (destination / "story_outline.md").write_text("\n".join(outline), encoding="utf-8")
    (destination / "visual_prompts.md").write_text("\n".join(prompts), encoding="utf-8")
    (destination / "character_bible.md").write_text(
        "# Character bible (complete before generating scenes)\n\n"
        "Create 2–4 original recurring characters. For each, define: name; role; silhouette; "
        "body proportions; exact colour palette; clothing/accessories; face and eye design; "
        "personality; movement style; English voice description; strengths; and gentle flaws.\n\n"
        "Attach approved reference images or fixed character descriptions to every scene-generation "
        "request. Do not imitate existing cartoon characters or studio styles.\n",
        encoding="utf-8",
    )
    checklist = """# YouTube publishing and child-safety checklist

- [ ] Watch the complete episode and review every frame and line of dialogue.
- [ ] Confirm the story is appropriate for ages 5–8 and has no dangerous imitation, frightening imagery, bullying, humiliation, or unsafe challenges.
- [ ] Confirm all characters, voices, music, sound effects, images, and animation are original or properly licensed.
- [ ] Check captions, spelling, audio levels, pacing, and video quality.
- [ ] Use an accurate title, description, and thumbnail; do not use misleading metadata or keyword stuffing.
- [ ] Set the audience accurately: this cartoon is intended for children, so mark it **Made for Kids** when uploading.
- [ ] Review current YouTube child-safety, quality, copyright, and monetization policies before publishing.
- [ ] Upload manually only after the owner approves the final MP4. This tool does not upload or publish.
- [ ] YouTube Kids inclusion is curated by YouTube and is not guaranteed by marking a video Made for Kids.

## Suggested metadata

**Category:** Film & Animation  
**Language:** English  
**Audience setting:** Made for Kids  
**Format:** 16:9 landscape episode, 3–5 minutes  
**Publishing status:** Draft until human approval
"""
    (destination / "youtube_upload_checklist.md").write_text(checklist, encoding="utf-8")
    return destination

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--idea", required=True, help="one-sentence funny adventure premise")
    parser.add_argument("--duration", type=int, default=PROFILE["duration_default_seconds"],
                        help="episode length in seconds (180-300; default 240)")
    parser.add_argument("--out", default=None, help="new output folder")
    args = parser.parse_args(argv)
    output = args.out or f"output/kids-{slugify(args.idea)}"
    try:
        folder = write_episode(args.idea, output, args.duration)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    print(f"Episode blueprint created: {folder}")
    print("This is a story/production plan, not a rendered 3D video.")
    print("No AI service, paid generation, voice service, cloud render, or upload was used.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
