# Animation Studio (separate from Ghost Clipper)

This folder adds a local-first production workflow for original vertical animated Shorts/Reels. It does **not** change the existing Android Ghost Clipper app or its Gradle build.

## What is combined

The source repositories are used as workflow references, not blindly copied or merged as code:

| Source | Role in this pipeline | Important limitation |
|---|---|---|
| [Zack D Films AI Video Generator](https://github.com/Anil-matcha/zack-d-films-ai-video-generator) | Curiosity-loop scripts, shot beats, character reference sheets, keyframes, narration and punchy edit structure | Its MuAPI / Veo image-to-video path is cloud-based and may cost money. Disabled by default. |
| [Claude Animation Skills](https://github.com/artemnovitckii/claude-animation-skills) | Three.js + GSAP scene direction, HyperFrames rendering, camera moves, impact beats, captions and frame-review workflow | Designed for a desktop Node/Python/FFmpeg environment, not direct execution inside Android. |
| [iArt Motion Skills](https://github.com/iart-ai/motion-skills) | Motion design patterns: timing, easing, kinetic typography, explainers and render-review loops | Some hosted iArt services require an account/credits; this integration uses the open workflow ideas only. |
| [Character Animation Creator](https://github.com/tachikomared/character-animation-creator-skill) | Optional 2D pixel-art sprite strips and transparent previews for game-like characters | This is a sprite-sheet workflow (32/64/128px cells), not a general 3D character rig generator. |
| [Roblox Character Animator](https://github.com/dillydog580/animate-roblox-characters) | Optional authentic Roblox R6/R15 character animation and export | Requires Blender 4.5+, compatible rigs and its Blender workflow; keep this as a Roblox-specific branch. |

## Recommended production flow

1. **Brief + script** — define the audience, promise, hook, payoff and call to action. Build a beat sheet with a new visual action every 2–4 seconds. Require human approval before asset generation.
2. **Visual bible** — lock character proportions, colors, clothing, props, lighting and environment. Reuse the same reference assets across shots.
3. **Choose an animation lane per project**:
   - **3D explainer:** Three.js scene engine, expressive character/prop actions, camera blocking and procedural effects.
   - **2D motion:** GSAP/HyperFrames for kinetic type, diagrams, transitions and graphic sequences.
   - **Sprite character:** use the Character Animation Creator for pixel-art sprite sheets, not as a substitute for 3D.
   - **Roblox:** use the Roblox R6/R15 Blender workflow only when Roblox-style characters are explicitly desired.
4. **Animate each beat** — each shot must change pose, camera, prop, environment or visual information. Do not reuse one still scene with only different voice lines.
5. **Voice + sound** — create narration locally where possible (for example, a locally installed TTS voice); layer licensed or self-created sound effects and music. Never assume a placeholder audio file is real narration.
6. **Assemble** — FFmpeg, vertical 1080×1920, 30 fps, readable captions, safe-area margins, voice-forward mix and short transitions.
7. **Quality gate** — validate every source asset, inspect rendered frames/contact sheets, verify the final MP4 with ffprobe and watch the full export before delivery.

## Free/offline-first and spend controls

- No network generation is invoked by the validator.
- No MuAPI, Veo, iArt hosted rendering, paid TTS or paid image/video generation is called automatically.
- Keep optional cloud providers behind an explicit opt-in and a visible per-job cost/credit confirmation.
- Missing provider output must be treated as a hard error. Never replace failed generations with fake image URLs, dummy audio or placeholder MP4 bytes.
- No automatic YouTube/Instagram upload or publishing.

## Desktop setup

Recommended: Windows 10/11, macOS or Linux desktop with Python 3.10+, Node.js 18+, FFmpeg and ffprobe. The user's existing Android app remains independent. Heavy Three.js/Blender rendering should be done on a desktop; phone-only rendering can be limited by memory and thermals.

Install the free local animation dependencies in the selected engine project (Three.js, GSAP, HyperFrames and Playwright as required by the chosen skill). Do not install all 56 iArt skills; select only the motion packs needed for a project.

## Project manifest

Start from `project.example.json`. Use paths relative to the project folder. Each shot must contain exactly one visual source: a rendered `video` or a still `image`. The validator checks source existence, video readability, dimensions and duration. It does not create animation or render an MP4.

Run:

```bash
python animation-studio/validate_project.py path/to/project.json
```

## Status

This is an additive production foundation and validation gate. It is not a claim that the external repositories have been merged into one executable engine, nor that an animation has already been rendered. The next implementation step is to connect one selected local engine (Three.js/HyperFrames or Blender) and test it with a short sample project.
