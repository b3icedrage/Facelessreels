# Ghost Clipper — Android

Ghost Clipper is an independent Android video clipping app inspired by the workflow of Clipper Engine. It is not the original application and does not contain the original developer's proprietary binaries or source.

## Working in this version
- Native Android app (Java, Android 8+ / API 26+)
- Pick a local video using Android's document picker
- Read source duration
- Set clip start and end times in seconds
- Trim and render MP4 locally with AndroidX Media3 Transformer
- Optional portrait 9:16 crop for Shorts, Reels and TikTok
- Optional removal of source audio
- Save the finished MP4 to a location selected by the user
- Cancel an in-progress export
- GitHub Actions workflow to build a debug APK

## Not yet included
- Twitch/YouTube live stream discovery or capture
- Chat-activity highlight detection
- AI-selected highlights
- Speech-to-text captions
- Background batch rendering

These features are not advertised as available in this build. Live-stream capture would also require platform-specific API/permission handling.

## Build
Requirements: JDK 17, Android SDK 35, Gradle 8.9.

Open the repository in Android Studio, sync Gradle, then run `gradle assembleDebug`.

APK output: `app/build/outputs/apk/debug/app-debug.apk`.

## GitHub Actions
Open Actions → Build Ghost Clipper APK → Run workflow. After the build finishes, download the `ghost-clipper-debug-apk` artifact.

## Privacy and cost
Local video processing runs on the Android device. No account, cloud upload, AI API key or paid service is required for the implemented trimming/export features.
