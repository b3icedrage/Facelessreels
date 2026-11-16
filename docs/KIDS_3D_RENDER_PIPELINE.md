# Free Kids Studio 3D Render Pipeline

This is the first procedural production pass for the Kids Studio. It uses:

- Blender for original, simple 3D characters and a colourful meadow scene.
- eSpeak NG for an offline English placeholder voiceover.
- FFmpeg to combine the rendered animation and voice track into an MP4.
- GitHub Actions to run the tools and store the result as a downloadable artifact.

No NVIDIA key, AI video API, paid credits, external TTS service, automatic upload, or publishing is used.

## Run a short preview first

1. Open the repository's **Actions** tab.
2. Select **Render Kids 3D Cartoon (Free Blender)**.
3. Choose **Run workflow**.
4. Enter a one-sentence adventure idea.
5. Keep the episode blueprint at 240 seconds and set **Render length** to **20 seconds** for the first test.
6. Start the workflow and wait for it to finish.
7. Download the artifact named `kids-3d-cartoon-<run-id>`. The finished preview is `kids_cartoon.mp4`.

Only after checking the preview should you run the workflow again with a 180, 240, or 300 second render length.

## Important quality and resource limits

- This first renderer is a procedural low-poly animatic. It has simple original 3D character shapes, a basic environment, camera, and looping expressive motion. It is not yet detailed studio-quality character animation or a generative AI video model.
- eSpeak NG is an offline synthetic placeholder voice. It is clear enough to test timing and audio muxing, but it is not a natural child-cartoon voice performance.
- A full 3–5 minute render can take a long time and consume GitHub Actions minutes. The workflow defaults to a 20-second preview to reduce wasted compute.
- The episode blueprint remains a template-assisted draft and needs a human story review. Check the final MP4, audio, child safety, and all rights before any manual upload.
- The workflow only creates an artifact. It does not publish to YouTube or claim YouTube Kids placement.

## Local rendering

Install Blender, FFmpeg, and eSpeak NG on a compatible computer. Generate a blueprint using `facelessreels.kids_studio`, then run:

```sh
blender --background --python facelessreels/kids_blender_render.py -- \
  --blueprint output/your-episode/episode_blueprint.json \
  --seconds 20 \
  --output output/your-episode/cartoon_silent.mp4
```

The Blender script saves an editable `.blend` file and numbered PNG frames beside the requested output path. It does not directly create the MP4: use FFmpeg to assemble the frames at 12 fps, then add the narration WAV. See `.github/workflows/render-kids-cartoon.yml` for the complete repeatable command sequence.
