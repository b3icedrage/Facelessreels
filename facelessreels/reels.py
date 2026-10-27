"""Offline faceless-reel draft pack generator; no API calls, spending, or publishing."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import textwrap
from datetime import datetime, timezone
from pathlib import Path

from facelessreels.ai import DEFAULT_MODEL, generate_ai_scenes

STYLES = {
    "educational": {
        "hook": "Here's what most people miss about {topic}.",
        "bridge": "Let's make it simple.",
        "points": [
            "First, understand the basics before chasing shortcuts.",
            "Next, focus on one useful action you can repeat consistently.",
            "Finally, measure what works and improve one thing at a time.",
        ],
        "cta": "Save this for later and follow for more practical breakdowns.",
    },
    "story": {
        "hook": "A small change can completely change how you approach {topic}.",
        "bridge": "Here's the lesson behind it.",
        "points": [
            "Start with the problem you are actually trying to solve.",
            "Try a small experiment instead of betting everything at once.",
            "Keep the lesson, even when the first attempt does not work.",
        ],
        "cta": "What would you try first? Share your idea in the comments.",
    },
    "listicle": {
        "hook": "Three things to know about {topic}.",
        "bridge": "Keep these in mind.",
        "points": [
            "Number one: make the goal specific and realistic.",
            "Number two: remove one unnecessary step from the process.",
            "Number three: review the result before repeating it.",
        ],
        "cta": "Save this checklist and send it to someone who needs it.",
    },
}

def slugify(value: str) -> str:
    result = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return (result[:48].strip("-") or "faceless-reel")

def build_scenes(topic: str, style: str, duration: int) -> list[dict]:
    topic = " ".join(topic.split())
    if not topic or len(topic) > 180:
        raise ValueError("topic must contain 1–180 characters")
    if style not in STYLES:
        raise ValueError(f"style must be one of: {', '.join(STYLES)}")
    if not 15 <= duration <= 60:
        raise ValueError("duration must be between 15 and 60 seconds")
    template = STYLES[style]
    lines = [
        ("HOOK", template["hook"].format(topic=topic)),
        ("SETUP", template["bridge"]),
        ("POINT 1", template["points"][0]),
        ("POINT 2", template["points"][1]),
        ("POINT 3", template["points"][2]),
        ("CTA", template["cta"]),
    ]
    weights = [1.25, 0.75, 1.0, 1.0, 1.0, 1.0]
    total = sum(weights)
    lengths = [round(duration * weight / total) for weight in weights]
    lengths[-1] += duration - sum(lengths)
    scenes, cursor = [], 0
    for index, ((label, narration), seconds) in enumerate(zip(lines, lengths), start=1):
        scenes.append({
            "index": index, "label": label, "start": cursor,
            "end": cursor + seconds, "duration": seconds,
            "narration": narration,
            "on_screen_text": textwrap.fill(narration, width=25),
            "visual_prompt": (
                f"Vertical 9:16 faceless background for a short video about {topic}. "
                f"Scene: {label.lower()}. Use abstract shapes, atmospheric lighting, "
                "clear negative space for captions, no logos, no readable text."
            ),
        })
        cursor += seconds
    return scenes

def srt_time(seconds: int) -> str:
    hours, rem = divmod(seconds, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours:02}:{minutes:02}:{secs:02},000"

def write_pack(topic: str, output: str, style: str = "educational",
               duration: int = 30, render: bool = False, ai: bool = False,
               model: str | None = None) -> dict:
    # Validate inputs and the output path before any optional network request.
    build_scenes(topic, style, duration)
    topic = " ".join(topic.split())
    destination = Path(output).expanduser()
    if destination.exists():
        raise ValueError(f"output path already exists; choose a new folder: {destination}")
    scenes = generate_ai_scenes(topic, style, duration, model) if ai else build_scenes(topic, style, duration)
    destination.mkdir(parents=True)
    try:
        script = "\n\n".join(f"{s['label']}\n{s['narration']}" for s in scenes) + "\n"
        (destination / "script.txt").write_text(script, encoding="utf-8")
        (destination / "voiceover.txt").write_text(
            " ".join(s["narration"] for s in scenes) + "\n", encoding="utf-8")
        subtitles = []
        for i, scene in enumerate(scenes, start=1):
            subtitles.extend([
                str(i),
                f"{srt_time(scene['start'])} --> {srt_time(scene['end'])}",
                scene["narration"], "",
            ])
        (destination / "captions.srt").write_text("\n".join(subtitles), encoding="utf-8")
        metadata = {
            "title": topic[:90], "topic": topic, "style": style,
            "duration_seconds": duration, "aspect_ratio": "9:16",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mode": "openai_api_draft" if ai else "offline_template_draft",
            "ai_provider": "openai_compatible_api" if ai else None,
            "ai_model": model or DEFAULT_MODEL if ai else None,
            "notice": "Draft only. Review claims, rights, captions and visuals before publishing.",
            "publishing_enabled": False, "paid_actions_enabled": False,
            "scenes": scenes,
        }
        (destination / "reel.json").write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        (destination / "visual_prompts.txt").write_text(
            "\n\n".join(f"SCENE {s['index']} — {s['label']}\n{s['visual_prompt']}" for s in scenes) + "\n",
            encoding="utf-8")
        rendered = False
        if render:
            if not shutil.which("ffmpeg"):
                raise ValueError("--render requires ffmpeg installed locally; no installation or download is attempted")
            render_video(destination, scenes)
            rendered = True
        return {"created": True, "output": str(destination), "scene_count": len(scenes),
                "duration_seconds": duration, "rendered": rendered,
                "publishing_enabled": False, "paid_actions_enabled": False, "ai_generated": ai}
    except Exception:
        # Keep partial files for diagnosis; never delete user data automatically.
        raise

def render_video(destination: Path, scenes: list[dict]) -> None:
    """Render simple caption cards with ffmpeg; all text is passed through text files."""
    files = []
    for scene in scenes:
        path = destination / f"scene-{scene['index']}.txt"
        path.write_text(scene["on_screen_text"], encoding="utf-8")
        files.append(path)
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    for scene in scenes:
        command += ["-f", "lavfi", "-i",
                    f"color=c=0x111827:s=1080x1920:r=30:d={scene['duration']}"]
    filters = []
    labels = []
    for i, (scene, path) in enumerate(zip(scenes, files)):
        safe_path = str(path.resolve()).replace("\\", "\\\\").replace(":", "\\:")
        label = f"v{i}"
        filters.append(
            f"[{i}:v]drawtext=textfile='{safe_path}':fontcolor=white:fontsize=58:"
            f"line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2:"
            f"box=1:boxcolor=0x111827@0.25:boxborderw=40,format=yuv420p[{label}]"
        )
        labels.append(f"[{label}]")
    filters.append("".join(labels) + f"concat=n={len(scenes)}:v=1:a=0[outv]")
    output_file = destination / "reel.mp4"
    command += ["-filter_complex", ";".join(filters), "-map", "[outv]",
                "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", str(output_file)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=300)
    if result.returncode:
        raise ValueError("ffmpeg render failed: " + (result.stderr[-1200:] or "unknown error"))
    for path in files:
        path.unlink(missing_ok=True)

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    generate = sub.add_parser("generate", help="create an offline draft, or opt in to real AI with --ai")
    generate.add_argument("--topic", required=True, help="topic, idea, or educational subject")
    generate.add_argument("--out", default=None, help="new output folder (must not already exist)")
    generate.add_argument("--style", choices=sorted(STYLES), default="educational")
    generate.add_argument("--duration", type=int, choices=range(15, 61), default=30)
    generate.add_argument("--render", action="store_true", help="optionally render caption-card MP4 using local ffmpeg")
    generate.add_argument("--ai", action="store_true", help="EXPLICITLY call the configured AI API; may incur charges")
    generate.add_argument("--model", default=None, help=f"AI model (default: {DEFAULT_MODEL}); used only with --ai")
    args = parser.parse_args(argv)
    try:
        output = args.out or str(Path("output") / slugify(args.topic))
        result = write_pack(args.topic, output, args.style, args.duration, args.render, args.ai, args.model)
        print(json.dumps(result, indent=2))
        return 0
    except (ValueError, OSError, subprocess.TimeoutExpired) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
