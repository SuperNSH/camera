# Camera: brief

Photo capture, video recording and live preview for Native Shell apps.

## Options

- nokhwa: Rust, desktop webcams only
- CameraX: Android, through JNI
- AVFoundation: iOS and macOS, through objc2 or a Swift bridge
- Reference only: react-native-vision-camera, expo-camera, Flutter camera

## Recommended path

nokhwa on desktop. CameraX and AVFoundation behind one native trait per platform.

## Edge cases to design for

- Permission denied: iOS asks once, then the user must change Settings
- Device busy or missing (simulators have no camera)
- Orientation changes while recording
- Interruptions when the app is backgrounded

## Research status

Research done 2026-11-09 by web search. Versions and licences are unverified until checked on the registry before pinning. Full catalogue: the research notes for the SuperNSH library set.
