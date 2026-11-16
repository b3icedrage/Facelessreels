"""Opt-in NVIDIA NIM script writer for original 3D kids adventures.
Creates a script and shot list only; it does not generate video or publish.
"""
from __future__ import annotations
import argparse, json, os, re, urllib.error, urllib.request
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
DEFAULT_MODEL = "minimaxai/minimax-m3.1-flash"

def clean(value, field, limit):
    if not isinstance(value, str):
        raise ValueError(f"{field} must be text")
    value = " ".join(value.split()).strip()
    if not value or len(value) > limit:
        raise ValueError(f"{field} must contain 1–{limit} characters")
    return value

def generate_episode(idea, duration=240, model=None):
    idea = " ".join(idea.split())
    if not idea or len(idea) > 220:
        raise ValueError("idea must contain 1–220 characters")
    if not 180 <= duration <= 300:
        raise ValueError("duration must be between 180 and 300 seconds")
    key = os.environ.get("NVIDIA_API_KEY", "").strip()
    if not key:
        raise ValueError("Set NVIDIA_API_KEY as a GitHub Actions secret or runtime secret; never commit it.")
    model = (model or os.environ.get("FACELESSREELS_NVIDIA_MODEL", DEFAULT_MODEL)).strip()
    if not model or len(model) > 120:
        raise ValueError("invalid NVIDIA model name")
    endpoint = os.environ.get("NVIDIA_NIM_CHAT_URL", DEFAULT_URL).strip()
    if not endpoint.startswith("https://") or len(endpoint) > 500:
        raise ValueError("NVIDIA_NIM_CHAT_URL must be HTTPS")
    system = (
        "You write original funny, warm 3D cartoon adventures for children ages 5–8. "
        "Use simple natural English, 2–4 original recurring characters, kind humour, "
        "a complete story and reassuring positive ending. No bullying, humiliation, "
        "dangerous imitation, graphic violence, frightening peril, adult themes, stereotypes, "
        "brands, copyrighted characters, or imitation of existing studios. Include dialogue "
        "and visual action in every scene. Return ONLY JSON with keys title, logline, moral, "
        "characters, scenes. characters: array of 2–4 objects with name, appearance, personality, "
        "voice_direction. scenes: exactly 9 objects with beat, action, dialogue, narration, "
        "animation_prompt, audio_notes. Each value is plain text. Animation prompts describe "
        "original 3D staging, camera, movement, expressions, environment and lighting; no text or logos."
    )
    user = (
        f"Write a complete episode. Profile: ages 5–8, English, funny adventures, original fully "
        f"3D cartoon, {duration} seconds, 16:9 landscape. Premise: {idea}. Use exactly these nine "
        "beats in order: COLD OPEN, MEET THE HEROES, THE FUNNY PROBLEM, ADVENTURE BEGINS, "
        "COMEDIC OBSTACLE 1, COMEDIC OBSTACLES 2 & 3, TEAMWORK SOLUTION, HAPPY PAYOFF, "
        "GENTLE GOODBYE. It must be a complete story, not a teaser. Return valid JSON only."
    )
    payload = {"model": model, "temperature": 0.7, "max_tokens": 6000,
               "messages": [{"role":"system","content":system},{"role":"user","content":user}]}
    request = urllib.request.Request(endpoint, data=json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + key, "Content-Type":"application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = json.loads(response.read(2_000_000).decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read(1000).decode("utf-8", errors="replace")
        raise ValueError(f"NVIDIA HTTP {exc.code}: {detail}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError(f"NVIDIA request failed: {exc}") from exc
    try:
        raw = body["choices"][0]["message"]["content"].strip()
        if raw.startswith(chr(96) * 3):
            raw = raw.split("\n", 1)[-1].rsplit(chr(96) * 3, 1)[0].strip()
        data = json.loads(raw)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("NVIDIA returned invalid JSON; no output files were written") from exc
    title = clean(data.get("title"), "title", 120)
    logline = clean(data.get("logline"), "logline", 500)
    moral = clean(data.get("moral"), "moral", 300)
    chars = data.get("characters")
    raw_scenes = data.get("scenes")
    if not isinstance(chars, list) or not 2 <= len(chars) <= 4:
        raise ValueError("NVIDIA must return 2–4 characters")
    characters = []
    for c in chars:
        if not isinstance(c, dict): raise ValueError("character must be an object")
        characters.append({k:clean(c.get(k), "character."+k, lim) for k,lim in
            (("name",50),("appearance",500),("personality",300),("voice_direction",200))})
    beats = ["COLD OPEN","MEET THE HEROES","THE FUNNY PROBLEM","ADVENTURE BEGINS",
             "COMEDIC OBSTACLE 1","COMEDIC OBSTACLES 2 & 3","TEAMWORK SOLUTION",
             "HAPPY PAYOFF","GENTLE GOODBYE"]
    if not isinstance(raw_scenes, list) or len(raw_scenes) != 9:
        raise ValueError("NVIDIA must return exactly nine scenes")
    weights = [0.08,0.10,0.12,0.12,0.12,0.16,0.18,0.08,0.04]
    lengths = [round(duration*w) for w in weights]
    lengths[-1] += duration - sum(lengths)
    scenes, cursor = [], 0
    for i,(item,beat,length) in enumerate(zip(raw_scenes,beats,lengths),1):
        if not isinstance(item,dict): raise ValueError("scene must be an object")
        scene = {"scene":i,"beat":beat,"start_seconds":cursor,
                 "end_seconds":cursor+length,"duration_seconds":length}
        for field,limit in (("action",1200),("dialogue",1800),("narration",800),
                            ("animation_prompt",1500),("audio_notes",500)):
            scene[field] = clean(item.get(field), "scene."+field, limit)
        scenes.append(scene); cursor += length
    return {"studio":"FacelessReels Kids Studio","created_at":datetime.now(timezone.utc).isoformat(),
        "provider":"NVIDIA NIM","model":model,"idea":idea,
        "profile":{"audience":"5–8 years","language":"English","genre":"funny adventures",
                   "visual_style":"original fully 3D cartoon","aspect_ratio":"16:9",
                   "youtube_audience":"Made for Kids"},
        "duration_seconds":duration,"title":title,"logline":logline,"positive_takeaway":moral,
        "characters":characters,"scenes":scenes,"status":"script_and_shotlist_draft",
        "video_generated":False,"rendered_video":False,"youtube_uploaded":False,
        "paid_actions_enabled":False,"human_review_required":True}

def write_episode(idea, output, duration=240, model=None):
    episode = generate_episode(idea,duration,model)
    dest = Path(output).expanduser()
    if dest.exists(): raise ValueError(f"output folder already exists: {dest}")
    dest.mkdir(parents=True)
    (dest/"episode_script.json").write_text(json.dumps(episode,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    script = [f"# {episode['title']}","","**Premise:** "+episode["logline"],
              "**Positive takeaway:** "+episode["positive_takeaway"],"","## Characters",""]
    for c in episode["characters"]:
        script.extend([f"### {c['name']}",c["appearance"],"Personality: "+c["personality"],
                       "Voice: "+c["voice_direction"],""])
    shots = ["# 3D animation shot list","",
             "Keep character designs, colours, proportions and voices consistent in every scene.",""]
    for s in episode["scenes"]:
        script.extend([f"### Scene {s['scene']}: {s['beat']}", "Action: "+s["action"],
                       "Dialogue: "+s["dialogue"],"Narration: "+s["narration"],""])
        shots.extend([f"## Scene {s['scene']}: {s['beat']}",
                      f"Duration: {s['duration_seconds']} seconds",s["animation_prompt"],
                      "Audio: "+s["audio_notes"],""])
    (dest/"episode_script.md").write_text("\n".join(script),encoding="utf-8")
    (dest/"3d_shotlist.md").write_text("\n".join(shots),encoding="utf-8")
    (dest/"youtube_review_checklist.md").write_text(
        "# YouTube review\n\n- [ ] Check age suitability and child safety.\n"
        "- [ ] Review every frame, dialogue line, caption and audio track.\n"
        "- [ ] Verify rights for characters, voices, music and assets.\n"
        "- [ ] Mark Made for Kids accurately in YouTube Studio.\n"
        "- [ ] YouTube Kids inclusion is curated and not guaranteed.\n"
        "- [ ] Upload manually only after owner approval.\n",encoding="utf-8")
    return dest

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--idea",required=True)
    parser.add_argument("--duration",type=int,default=240,choices=range(180,301))
    parser.add_argument("--out",default=None)
    parser.add_argument("--model",default=None)
    args=parser.parse_args(argv)
    slug=re.sub(r"[^a-z0-9]+","-",args.idea.lower()).strip("-")[:48] or "episode"
    output=args.out or f"output/kids-nvidia-{slug}"
    try: folder=write_episode(args.idea,output,args.duration,args.model)
    except (ValueError,OSError) as exc: parser.error(str(exc))
    print(f"NVIDIA script and 3D shot list created: {folder}")
    print("No video render or upload occurred.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
