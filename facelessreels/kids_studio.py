"""Offline-first episode planner and script fallback for FacelessReels Kids Studio.

This creates an editable story draft and production blueprint. It does not render
3D animation, synthesize voices, contact external services, or publish videos.
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

    characters = [
        {"name": "Pip", "role": "curious squirrel and enthusiastic planner",
         "appearance": "Small golden-brown squirrel, cream muzzle, oversized expressive eyes, teal scarf, fluffy tail.",
         "personality": "Energetic, imaginative, kind, and sometimes rushes ahead.",
         "voice_direction": "Bright, playful, warm English voice; clear and unhurried."},
        {"name": "Tilly", "role": "thoughtful little turtle and careful problem-solver",
         "appearance": "Mint-green turtle, soft yellow shell with simple original swirls, orange satchel, friendly eyes.",
         "personality": "Patient, observant, gently funny, and good at listening.",
         "voice_direction": "Gentle, reassuring, lightly humorous English voice; clear and unhurried."},
    ]
    story = [
        ("A tiny surprise interrupts the friends. Pip makes an over-the-top guess, while Tilly notices one useful clue.",
         "Pip: “Did you see that? My tail nearly did a somersault!”\nTilly: “Let's look carefully before we guess.”",
         "On an ordinary day, one little surprise was about to become a very big adventure."),
        ("Pip and Tilly introduce themselves through a playful moment and explain why they enjoy helping their neighbours.",
         "Pip: “I'm Pip! Fast feet, big ideas!”\nTilly: “And I'm Tilly. I like a plan… and snack breaks.”",
         "Best friends Pip and Tilly loved exploring their colourful home together."),
        (f"The friends discover the harmless problem: {idea}. They decide to help instead of arguing or blaming anyone.",
         "Pip: “We have to fix this!”\nTilly: “We can. First, let's understand what happened.”",
         "Then they spotted a problem that needed two very different kinds of thinking."),
        ("Pip suggests a quick first plan. Tilly adds a safe step, and together they begin helping.",
         "Pip: “Follow my brilliant plan!”\nTilly: “I will. And let's remember the careful part.”",
         "With a cheerful plan and a little teamwork, the friends set off."),
        ("Pip tries to do everything at once and makes a harmless muddle. Tilly turns the mistake into a funny lesson.",
         "Pip: “Ta-da! Wait… that wasn't the ta-da I planned.”\nTilly: “Every good plan has room for a giggle.”",
         "Their first try became a silly tangle, but nobody gave up."),
        ("They encounter two more gentle obstacles. Pip listens, Tilly tries Pip's idea, and both learn to take turns.",
         "Pip: “I have another idea. What do you think?”\nTilly: “Let's combine it with mine!”\nPip: “Team idea!”",
         "Two more surprises reminded them that listening can be just as important as having ideas."),
        ("Pip uses imagination while Tilly uses careful observation. They combine their strengths and solve the problem safely.",
         "Tilly: “I found the missing clue!”\nPip: “And I know how we can use it. Together?”\nTilly: “Together!”",
         "At last, the friends put their best ideas together and found a kind solution."),
        ("The neighbours celebrate. A small visual gag gives the friends a warm laugh and shows the result of helping.",
         "Pip: “We did it!”\nTilly: “We did it by helping each other.”\nPip: “And by not asking my tail to do the thinking.”",
         "The day ended with happy cheers, friendly smiles, and one last little surprise."),
        ("The friends wave goodbye and share a simple takeaway about teamwork and asking for help.",
         "Pip: “Big problems feel smaller with a friend.”\nTilly: “See you on our next adventure!”",
         "And that is how two friends discovered that teamwork makes every adventure brighter. The end!"),
    ]
    seconds = [round(duration * weight) for _, weight, _ in BEATS]
    seconds[-1] += duration - sum(seconds)
    scenes, cursor = [], 0
    for index, ((name, _weight, direction), (action, dialogue, narration), length) in enumerate(zip(BEATS, story, seconds), 1):
        scenes.append({
            "scene": index, "beat": name, "start_seconds": cursor,
            "end_seconds": cursor + length, "duration_seconds": length,
            "story_direction": direction, "action": action,
            "dialogue": dialogue, "narration": narration,
            "animation_prompt": (
                "Original high-quality 3D family cartoon. Keep Pip and Tilly's approved designs "
                "consistent. Rounded appealing shapes, expressive faces, readable silhouettes, "
                "colourful coherent environment, smooth character acting, gentle squash-and-stretch, "
                "cinematic soft lighting, clear staging, appealing camera movement; no text, logos, or watermarks. "
                f"Stage this scene: {action}"
            ),
            "audio_notes": "Clear child-friendly English dialogue and narration; original gentle music; soft comedic sound effects; no copyrighted songs.",
            "sound_direction": "English narrator and character dialogue, gentle original music, clear comedic sound effects.",
        })
        cursor += length
    return {
        "studio": "FacelessReels Kids Studio",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "generation_mode": "offline_fallback",
        "provider": "local templates; no external API",
        "idea": idea, "title": "The Great Teamwork Adventure",
        "profile": PROFILE, "duration_seconds": duration,
        "scene_count": len(scenes), "characters": characters, "scenes": scenes,
        "status": "offline_script_draft_needs_human_review",
        "rendered_video": False, "voiceover_generated": False,
        "youtube_uploaded": False, "paid_actions_enabled": False,
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
    script = [
        f"# {episode['title']}", "", f"**Premise:** {episode['idea']}",
        f"**Audience:** {PROFILE['audience']}  ",
        f"**Length:** {duration // 60} minutes {duration % 60} seconds  ",
        "**Draft mode:** Offline fallback (template-assisted; review and personalise before production).",
        "", "## Character bible", "",
    ]
    for character in episode["characters"]:
        script.extend([
            f"### {character['name']} — {character['role']}",
            character["appearance"], f"Personality: {character['personality']}",
            f"Voice: {character['voice_direction']}", "",
        ])
    prompts = ["# 3D scene and animation prompts", "",
               "Keep the same approved character designs, proportions, colours, clothing, and voices in every scene.", ""]
    for scene in episode["scenes"]:
        timing = f"{scene['start_seconds']}–{scene['end_seconds']} sec"
        script.extend([
            f"## Scene {scene['scene']}: {scene['beat']} ({timing})",
            f"**Action:** {scene['action']}", "", "**Dialogue:**",
            scene["dialogue"], "", f"**Narration:** {scene['narration']}", "",
        ])
        prompts.extend([
            f"## Scene {scene['scene']}: {scene['beat']}",
            f"Duration: {scene['duration_seconds']} seconds.",
            scene["animation_prompt"], f"Audio: {scene['audio_notes']}", "",
        ])
    (destination / "episode_script.md").write_text("\n".join(script), encoding="utf-8")
    (destination / "story_outline.md").write_text(
        "# Story outline\n\n" + "\n".join(
            f"## {s['scene']}. {s['beat']}\n{s['story_direction']}" for s in episode["scenes"]
        ) + "\n", encoding="utf-8"
    )
    (destination / "visual_prompts.md").write_text("\n".join(prompts), encoding="utf-8")
    (destination / "character_bible.md").write_text(
        "# Character bible\n\n" + "\n".join(
            f"## {c['name']}\n{c['appearance']}\nPersonality: {c['personality']}\nVoice: {c['voice_direction']}"
            for c in episode["characters"]
        ) + "\n", encoding="utf-8"
    )
    checklist = """# YouTube publishing and child-safety checklist

- [ ] Review and personalise this template-assisted script; verify the story matches the premise.
- [ ] Watch the complete episode and review every frame and line of dialogue.
- [ ] Confirm age suitability; remove dangerous imitation, frightening imagery, bullying, or unsafe challenges.
- [ ] Confirm all characters, voices, music, sound effects, images, and animation are original or properly licensed.
- [ ] Check captions, spelling, audio levels, pacing, and video quality.
- [ ] Mark the audience accurately as Made for Kids when uploading.
- [ ] Upload manually only after owner approval of the final MP4.
- [ ] YouTube Kids inclusion is curated by YouTube and is not guaranteed.

This workflow creates a script and production blueprint only. It does not render, synthesize, or publish.
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
    output = args.out or f"output/kids-offline-{slugify(args.idea)}"
    try:
        folder = write_episode(args.idea, output, args.duration)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    print(f"Offline episode script and production blueprint created: {folder}")
    print("No network request, paid service, video render, voice synthesis, or upload was used.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
