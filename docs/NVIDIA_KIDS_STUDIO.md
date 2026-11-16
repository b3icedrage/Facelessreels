# NVIDIA integration for FacelessReels Kids Studio

## Script generation

This opt-in integration uses NVIDIA NIM Chat Completions to draft a complete English adventure for ages 5–8, with original character descriptions, nine timed scenes, dialogue, narration, and a 3D animation shot list. It does not generate video, render Blender scenes, synthesize voices, upload, or publish.

NVIDIA hosted endpoint: https://integrate.api.nvidia.com/v1/chat/completions
Default model: meta/llama-3.3-70b-instruct. Model access, quota, rates and pricing depend on the account and current catalog. A key does not prove a model is enabled or free. Check NVIDIA API Catalog before first use.

## Add the API key securely

Never paste the key into chat, source code, .env.example, issues, or commit history.

For GitHub Actions:
1. Open this repository on GitHub.
2. Go to Settings → Secrets and variables → Actions.
3. Select New repository secret.
4. Set the name to NVIDIA_API_KEY and paste the key into GitHub's secret field.
5. Optionally set FACELESSREELS_NVIDIA_MODEL as a repository variable to override the default model.

The GitHub connector used for this change cannot create or read Actions secrets. You must add the secret in GitHub settings. For a deployed app, add the key to the host's server-side environment settings only; never expose it in VITE_* or browser code.

For local Windows testing, use a temporary PowerShell session:
```powershell
$env:NVIDIA_API_KEY = Read-Host "Paste NVIDIA API key"
python -m facelessreels.kids_studio_ai --idea "Two animal friends return a runaway balloon" --duration 240
```
Close the terminal after use. Do not commit a .env file.

## Run

Only run this command when you want to send a real request to NVIDIA (it may consume quota or incur charges):
```powershell
python -m facelessreels.kids_studio_ai --idea "Two animal friends return a runaway balloon" --duration 240
```
The command refuses to overwrite an existing output folder. It writes episode_script.json, episode_script.md, 3d_shotlist.md, and youtube_review_checklist.md.

## Video generation is a separate service

NVIDIA documents Wan2.2 video generation through a separately deployed NVIDIA Visual Generative AI NIM service, with POST /v1/videos/generations and model name wan-ai/wan2.2. The server is configured for text-to-video or image-to-video using NIM_MODEL_VARIANT=t2v or i2v. This is not the hosted chat-completions endpoint above. A hosted LLM API key does not by itself provide a hosted Wan2.2 video endpoint, GPU capacity, or free rendering. Self-hosting can require compatible GPU hardware and infrastructure cost.

Therefore this repository does not call a guessed video URL or start a paid cloud GPU. The video-generation switch remains disabled until an actual video NIM server URL, authentication method, deployment entitlement, and budget are confirmed.

## Safety and YouTube

Keep video generation, cloud rendering and uploads disabled until explicitly approved. Review every script, frame, voice and music track. Use original or licensed assets. Mark child-directed uploads Made for Kids accurately in YouTube Studio. YouTube Kids inclusion is separately curated and not guaranteed.
