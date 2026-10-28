"""Optional speech synthesis and audio muxing for an existing rendered reel.

Requires the optional edge-tts package, network access for speech synthesis, and local FFmpeg/ffprobe.
No API key is needed. Nothing is uploaded or published by this module.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_VOICE = "en-US-AriaNeural"


def _run(command: list[str], timeout: int = 300) -> subprocess.CompletedProcess:
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        detail = (result.stderr or result.stdout or "unknown error")[-1600:]
        raise ValueError(f"command failed ({result.returncode}): {detail}")
    return result


def media_duration(path: Path) -> float:
    result = _run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], timeout=30)
    try:
        duration = float(result.stdout.strip())
    except ValueError as exc:
        raise ValueError(f"could not read media duration for {path}") from exc
    if duration <= 0:
        raise ValueError(f"media has invalid duration: {path}")
    return duration


def create_voiceover(folder: str | Path, voice: str = DEFAULT_VOICE) -> dict:
    """Create voiceover.mp3 and mux it into reel.mp4 as reel_with_voiceover.mp4."""
    destination = Path(folder).expanduser().resolve()
    metadata_path = destination / "reel.json"
    video_path = destination / "reel.mp4"
    if not destination.is_dir() or not metadata_path.is_file():
        raise ValueError("input must be an existing reel output folder containing reel.json")
    if not video_path.is_file():
        raise ValueError("reel.mp4 is missing; first generate the reel with the --render option")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise ValueError("FFmpeg and ffprobe must be installed locally")
    try:
        import edge_tts  # noqa: F401 - checks the optional dependency is installed
    except ImportError as exc:
        raise ValueError(
            "voiceover requires the optional edge-tts package. Install it with: "
            "python -m pip install 'facelessreels-ai[voiceover]'"
        ) from exc

    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        scenes = metadata["scenes"]
        narration = " ".join(str(scene["narration"]).strip() for scene in scenes).strip()
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
        raise ValueError("reel.json does not contain a valid scene narration list") from exc
    if not narration:
        raise ValueError("reel.json has no narration text")
    if not isinstance(voice, str) or not voice.strip() or len(voice) > 100:
        raise ValueError("voice must contain 1–100 characters")

    audio_path = destination / "voiceover.mp3"
    output_path = destination / "reel_with_voiceover.mp4"
    # Use the installed package's CLI so this remains compatible across edge-tts versions.
    _run([
        sys.executable, "-m", "edge_tts", "--text", narration,
        "--voice", voice.strip(), "--write-media", str(audio_path),
    ], timeout=180)
    if not audio_path.is_file() or audio_path.stat().st_size == 0:
        raise ValueError("speech provider did not produce an audio file")

    video_seconds = media_duration(video_path)
    audio_seconds = media_duration(audio_path)
    if audio_seconds > video_seconds:
        speed = audio_seconds / video_seconds
        if speed > 2.0:
            raise ValueError(
                f"voiceover ({audio_seconds:.1f}s) is too long for this video ({video_seconds:.1f}s). "
                "Shorten the narration or render a longer reel before retrying."
            )
        audio_filter = f"atempo={speed:.5f},apad=whole_dur={video_seconds:.3f}"
    else:
        audio_filter = f"apad=whole_dur={video_seconds:.3f}"
    _run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(video_path), "-i", str(audio_path),
        "-filter_complex", f"[1:a]{audio_filter}[voice]",
        "-map", "0:v:0", "-map", "[voice]", "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k", "-t", f"{video_seconds:.3f}",
        "-movflags", "+faststart", str(output_path),
    ], timeout=300)
    return {
        "created": True,
        "voiceover": str(audio_path),
        "video": str(output_path),
        "captions_srt": str(destination / "captions.srt"),
        "video_seconds": round(video_seconds, 2),
        "original_voice_seconds": round(audio_seconds, 2),
        "voice": voice.strip(),
        "published": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="existing output folder made by facelessreels.reels")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help=f"Edge TTS voice (default: {DEFAULT_VOICE})")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(create_voiceover(args.input, args.voice), indent=2))
        return 0
    except (ValueError, OSError, subprocess.TimeoutExpired) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
