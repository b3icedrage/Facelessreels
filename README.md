# Ghost Clipper — Android

Independent local-first Android video clipping app. This is not the original Clipper Engine app or a copy of its proprietary code.

## Features in this build
- Import local videos using Android's document picker.
- Set exact start/end timestamps and export MP4.
- Crop exports to portrait 9:16 using AndroidX Media3 Transformer.
- Optionally remove original audio.
- **Hybrid highlight suggestions:** samples frames locally and scores scene changes; optionally import a Twitch/YouTube chat replay CSV with elapsed timestamps (`timestamp`/`time`/`offset` column, seconds, `MM:SS` or `HH:MM:SS`) to boost moments with high chat activity. Ranks up to five non-overlapping candidate windows. This is a replay-assisted heuristic, not live chat ingestion or semantic AI.
- **Offline AI speech captions:** downloads the small English Vosk speech model on first use (approximately 40 MB), decodes the video's audio track on-device, and exports word-timed SRT subtitles. Requires internet only for the initial model download; transcription is local. English model only in this release.

## Not yet implemented
- Direct Twitch/YouTube live-stream capture, automatic chat API ingestion and stream discovery. The current chat workflow imports a replay CSV exported from a platform-compliant tool; it does not connect directly to platform APIs or capture live streams.
- Automatic semantic highlight understanding, face tracking or speaker diarization.
- Burn-in subtitles on the exported MP4 (SRT sidecar export is supported).

## Build
JDK 17, Android SDK 35, Gradle 8.9. Android Studio can import this project. Run `gradle assembleDebug`.

GitHub Actions builds a debug APK on pushes to `main` and on manual workflow dispatch. Download the `ghost-clipper-debug-apk` artifact from the Actions run.

## Privacy and cost
Video decoding, scene scanning and speech recognition run on-device. No paid API, API key, account or cloud upload is used. The initial Vosk model download uses network data.

## YouTube live integration

Ghost Clipper can connect to the signed-in channel with Google's Android sign-in flow, list that channel's active broadcasts, and collect live-chat message timestamps through the official YouTube Data API v3. Chat activity is grouped into five-second windows and can be combined with local scene-change analysis for highlight suggestions.

Setup:
1. Create a Google Cloud project and enable **YouTube Data API v3**.
2. Configure the Android OAuth client for package `app.ghostclipper` and the SHA-1 signing certificate of the APK you install.
3. Configure the OAuth consent screen, then rebuild and install the APK.
4. Open Ghost Clipper and tap **Connect my YouTube channel** while your channel is live.

The app requests the read-only YouTube scope. Live chat is only available while the event is active; this feature does not download YouTube video files. Select an authorized local recording in Ghost Clipper to render clips. Keep the app open during capture. The API polling interval returned by YouTube is respected.

## Separate animation production module

The repository also includes an independent, local-first animation workflow foundation. It does not alter the Android app:

- [Animation Studio guide](animation-studio/README.md)
- [Example project manifest](animation-studio/project.example.json)
- [Asset and media validator](animation-studio/validate_project.py)
