# Ghost Clipper — Android

Independent local-first Android video clipping app. This is not the original Clipper Engine app or a copy of its proprietary code.

## Features in this build
- Import local videos using Android's document picker.
- Set exact start/end timestamps and export MP4.
- Crop exports to portrait 9:16 using AndroidX Media3 Transformer.
- Optionally remove original audio.
- **Scene-change highlight suggestions:** samples frames locally, compares colour histograms and ranks up to five non-overlapping candidate windows. This is a visual heuristic, not semantic understanding or chat-aware highlight AI; review suggested ranges before exporting.
- **Offline AI speech captions:** downloads the small English Vosk speech model on first use (approximately 40 MB), decodes the video's audio track on-device, and exports word-timed SRT subtitles. Requires internet only for the initial model download; transcription is local. English model only in this release.

## Not yet implemented
- Direct Twitch/YouTube live-stream capture, chat ingestion or stream discovery. These require platform APIs, OAuth/API credentials, and platform-compliant access to stream media. This app does not scrape private streams or bypass platform restrictions.
- Automatic semantic highlight understanding, face tracking or speaker diarization.
- Burn-in subtitles on the exported MP4 (SRT sidecar export is supported).

## Build
JDK 17, Android SDK 35, Gradle 8.9. Android Studio can import this project. Run `gradle assembleDebug`.

GitHub Actions builds a debug APK on pushes to `main` and on manual workflow dispatch. Download the `ghost-clipper-debug-apk` artifact from the Actions run.

## Privacy and cost
Video decoding, scene scanning and speech recognition run on-device. No paid API, API key, account or cloud upload is used. The initial Vosk model download uses network data.
