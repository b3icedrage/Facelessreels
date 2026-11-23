#!/usr/bin/env python3
"""Validate an Animation Studio project manifest and its local media assets.

This is a no-network QA tool. It never generates media, calls paid APIs or uploads files.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


def fail(message: str) -> None:
    print(f"ERROR: {message}")


def probe_video(path: Path) -> tuple[bool, str]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return False, "ffprobe is not installed or not on PATH"
    command = [
        ffprobe, "-v", "error", "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of", "json", str(path),
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, f"ffprobe failed: {exc}"
    if result.returncode != 0:
        return False, result.stderr.strip() or "ffprobe rejected the file"
    try:
        data = json.loads(result.stdout)
        duration = float(data.get("format", {}).get("duration", 0))
        video_streams = [s for s in data.get("streams", []) if s.get("codec_type") == "video"]
        if duration <= 0 or not video_streams:
            return False, "file has no valid video stream or positive duration"
        stream = video_streams[0]
        return True, f"{duration:.2f}s, {stream.get('width')}x{stream.get('height')}"
    except (ValueError, TypeError, json.JSONDecodeError):
        return False, "ffprobe returned invalid media metadata"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="Path to project.json")
    args = parser.parse_args()
    manifest_path = args.manifest.resolve()
    if not manifest_path.is_file():
        fail(f"manifest not found: {manifest_path}")
        return 2
    try:
        project: dict[str, Any] = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read JSON manifest: {exc}")
        return 2

    errors = 0
    root = manifest_path.parent
    title = project.get("title")
    if not isinstance(title, str) or not title.strip():
        fail("title must be a non-empty string")
        errors += 1

    fmt = project.get("format", {})
    if not isinstance(fmt, dict):
        fmt = {}
    width, height, fps = fmt.get("width"), fmt.get("height"), fmt.get("fps")
    if (width, height) != (1080, 1920):
        fail("vertical Shorts export should declare width=1080 and height=1920")
        errors += 1
    if not isinstance(fps, (int, float)) or fps <= 0:
        fail("format.fps must be a positive number")
        errors += 1

    shots = project.get("shots")
    if not isinstance(shots, list) or not shots:
        fail("shots must be a non-empty array")
        return 2

    total_seconds = 0.0
    seen_ids: set[str] = set()
    for index, shot in enumerate(shots, start=1):
        if not isinstance(shot, dict):
            fail(f"shot {index} must be an object")
            errors += 1
            continue
        shot_id = shot.get("id")
        if not isinstance(shot_id, str) or not shot_id.strip() or shot_id in seen_ids:
            fail(f"shot {index} needs a unique, non-empty id")
            errors += 1
        else:
            seen_ids.add(shot_id)
        duration = shot.get("duration_seconds")
        if not isinstance(duration, (int, float)) or duration <= 0:
            fail(f"shot {shot_id or index}: duration_seconds must be positive")
            errors += 1
        else:
            total_seconds += float(duration)

        sources = [key for key in ("video", "image") if shot.get(key)]
        if len(sources) != 1:
            fail(f"shot {shot_id or index}: provide exactly one of video or image")
            errors += 1
            continue
        source = root / str(shot[sources[0]])
        if not source.is_file():
            fail(f"shot {shot_id or index}: missing {sources[0]} asset: {source}")
            errors += 1
            continue
        if sources[0] == "video":
            ok, detail = probe_video(source)
            if not ok:
                fail(f"shot {shot_id or index}: invalid video: {detail}")
                errors += 1
            else:
                print(f"OK: shot {shot_id}: {detail}")
        else:
            if source.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
                fail(f"shot {shot_id or index}: image must be PNG, JPG or WebP")
                errors += 1
            else:
                print(f"OK: shot {shot_id}: image exists ({source.stat().st_size} bytes)")

    for field in ("voiceover", "music", "captions"):
        value = project.get(field)
        if value:
            asset = root / str(value)
            if not asset.is_file():
                fail(f"{field} asset does not exist: {asset}")
                errors += 1

    print(f"\nProject: {title or '(untitled)'}")
    print(f"Shots: {len(shots)} | planned timeline: {total_seconds:.2f}s")
    if errors:
        print(f"QA FAILED: {errors} issue(s)")
        return 1
    print("QA PASSED: manifest and referenced assets passed basic checks.")
    print("Note: visual quality, audio quality, caption timing and final export still require human review.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
