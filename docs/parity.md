# Parity with the Flutter camera plugin and react-native-vision-camera

Each row names one public API of Flutter's camera plugin (the names come from `.refs/flutter-packages/packages/camera`, read on 2026-11-09) or of react-native-vision-camera (the names come from `.refs/react-native-vision-camera`, package `packages/react-native-vision-camera`, read on 2026-11-09), what nsh-camera does for it, and the test that covers it. `expo-camera` is reference-only per [brief.md](brief.md) and is not enumerated.

No row counts as verified until GitHub Actions runs a test for it (AGENTS.md). The statuses below describe the written behavior; this table was written before this work's first CI run.

Status words:

- **Done**: written and covered by a test on both sides.
- **Partial**: written, with the limit named.
- **Accepted**: the name is accepted for shape and passed on, but nothing uses it.
- **Platform only**: the effect needs a device; the test checks what the library passes on.
- **Not covered**: a non-goal; the reason is in the row.

Rust names are in `crates/nsh-camera`. TypeScript names are in `packages/nsh-camera`. Rust tests are in `crates/nsh-camera/tests/`. TypeScript tests are in `packages/nsh-camera/tests/`. Edge-case test names are identical on both sides; a bare name means `edge_cases.rs` and `edge-cases.test.tsx` together.

## The `camera` package

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `availableCameras()` | `Camera::devices()` | `Camera.devices()` | Done. The platform's list; an empty list when none are present, as on a simulator | `fake_backend.rs`; `camera.test.tsx`; `device.test.tsx`; `simulator_without_camera_reports_not_available` |
| `CameraController(description, resolutionPreset, …)` + `initialize()` | `Camera::open(id)` | `Camera.open(id)` | Partial. One call creates and initializes; there is no separate initialize, and the camera permission must be granted first. An id matching no device resolves `ERR_CAMERA_NOT_AVAILABLE`; an empty id resolves `ERR_CAMERA_INVALID_ARGUMENT` before the device is touched | `fake_backend.rs`; `camera.test.tsx`; `invalid_arguments_report_invalid_argument` |
| `setDescription(description)` | open the other id | open the other id | Not covered. Reopen the other device; a hot switch while a recording runs is a non-goal this release | none |
| `prepareForVideoRecording()` | not in the API | not in the API | Not covered. Audio setup happens inside `start_recording(audio: true)` | none |
| `takePicture()` | `CameraDevice::capture_photo(PhotoOptions)` | `device.capturePhoto(photoOptions)` | Done. The photo bytes come back in memory; writing the file is the app's job | `fake_backend.rs`; `device.test.tsx` |
| `startVideoRecording()` / `stopVideoRecording()` | `CameraDevice::start_recording(RecordingOptions)` / `RecordingSession::stop()` | `device.startRecording(recordingOptions)` / `session.stop()` | Done. The video bytes come back in memory, not a file. A second start while one runs resolves `ERR_CAMERA_IN_PROGRESS` | `fake_backend.rs`; `device.test.tsx`; `second_recording_while_first_runs_is_in_progress` |
| `pauseVideoRecording()` / `resumeVideoRecording()` | not in the API | not in the API | Not covered. A paused recording needs timer semantics the seam does not model | none |
| `startImageStream(callback)` / `stopImageStream()` / `onLatestImageAvailable` / `CameraImage` / `Plane` / `ImageFormat` | `PreviewStream::next_frame()` | `preview.nextFrame()` | Partial. Whole frames, one per call; stopping is closing the stream. YUV plane access is a non-goal — frame data stays opaque bytes | `fake_backend.rs`; `closed_preview_has_no_frames` |
| `CameraPreview` widget / `buildPreview()` | not in the API | not in the API | Not covered. UI is the NSX app's job; the library exposes frames only | none |
| `pausePreview()` / `resumePreview()` | not in the API | not in the API | Not covered. A pause is the app not calling `next_frame()` | none |
| `lockCaptureOrientation([orientation])` / `unlockCaptureOrientation()` | `RecordingOptions.orientation` | `recordingOptions.orientation` | Done. Honored where the platform can; `ERR_CAMERA_ORIENTATION_UNSUPPORTED` at recording start where it cannot (desktop) | `orientation_lock_platform_cannot_honor_is_orientation_unsupported` |
| `getMaxZoomLevel()` / `getMinZoomLevel()` / `setZoomLevel(zoom)` | not in the API | not in the API | Not covered. Nothing is wired to scale the lens | none |
| `setVideoStabilizationMode(mode)` / `getSupportedVideoStabilizationModes()` | not in the API | not in the API | Not covered. A capture-session configuration the seams do not carry | none |
| `isZeroShutterLagSupported()` / `setZeroShutterLagEnabled(enabled)` | not in the API | not in the API | Not covered. An Android capture mode that needs CameraX wired | none |
| `setFlashMode(mode)` | not in the API | not in the API | Not covered. A hardware control with no wired native backend | none |
| `setExposureMode()` / `setExposurePoint()` / `getMinExposureOffset()` / `getMaxExposureOffset()` / `getExposureOffsetStepSize()` / `setExposureOffset()` | not in the API | not in the API | Not covered. Manual capture controls wait for a native backend | none |
| `setFocusMode()` / `setFocusPoint()` | not in the API | not in the API | Not covered. The same | none |
| `setJpegImageQuality(quality)` | not in the API | not in the API | Not covered. No encoder sits behind the seam yet | none |
| `supportsImageStreaming()` | every open device exposes a `PreviewStream` | same | Partial. There is no per-platform capability flag to query | `fake_backend.rs` |
| `dispose()` | `close()` on the device and the preview; the rest is `Drop` | `close()` | Partial. Closing resolves once; any later call resolves `ERR_CAMERA_ALREADY_RESOLVED`. No separate disposed-check | `exactly_once.rs`; `closed_preview_has_no_frames` |
| `debugCheckIsDisposed()` | not in the API | not in the API | Not covered. A Dart debug assert; ownership makes it moot here | none |
| `CameraValue` | not in the API | not in the API | Not covered. No reactive value object; each call returns its own result | none |
| `Optional` | not in the API | not in the API | Not covered. A Dart `copyWith` workaround | none |

## `CameraPlatform` interface methods

The federated interface in `camera_platform_interface`; the app-facing rows above carry the behavior. `method_channel_camera.dart` and `type_conversion.dart` are Dart-internal plumbing and get no rows.

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `availableCameras` | `Camera::devices()` | `Camera.devices()` | Done. See the app-facing row | `fake_backend.rs`; `camera.test.tsx` |
| `createCamera` / `createCameraWithSettings` | folded into `Camera::open(id)` | same | Partial. One call; no two-phase create | `fake_backend.rs`; `camera.test.tsx` |
| `initializeCamera(cameraId, imageFormatGroup:)` | folded into `Camera::open(id)` | same | Partial. Same; the format-group argument is a non-goal (see `ImageFormatGroup`) | `fake_backend.rs`; `camera.test.tsx` |
| `onCameraInitialized` | `Camera::open(id)` resolving | same | Partial. No preview-size payload; open resolves when the camera is ready | `fake_backend.rs`; `camera.test.tsx` |
| `onCameraResolutionChanged` | not in the API | not in the API | Not covered. Resolution is chosen up front in the options | none |
| `onCameraClosing` / `onCameraError` | the recording resolves `ERR_CAMERA_INTERRUPTED` at the next `stop()` | same | Done. Errors surface as coded failures on the next call, not as a stream. The scripted-link tests drive this | `backgrounded_interruption_resolves_recording_as_interrupted` |
| `onVideoRecordedEvent` | `RecordingSession::stop()` resolving with the bytes | `session.stop()` | Done. No `maxVideoDuration` field | `fake_backend.rs`; `device.test.tsx` |
| `onDeviceOrientationChanged` | `RecordingSession::orientation()` / `Frame.orientation` | `session.orientation()` / `frame.orientation` | Done. See the events row below | `orientation_change_while_recording_updates_session` |
| `lockCaptureOrientation` / `unlockCaptureOrientation` | `RecordingOptions.orientation` | `recordingOptions.orientation` | Done. See the app-facing row | `orientation_lock_platform_cannot_honor_is_orientation_unsupported` |
| `takePicture` | `CameraDevice::capture_photo(PhotoOptions)` | `device.capturePhoto(photoOptions)` | Done. See the app-facing row | `fake_backend.rs`; `device.test.tsx` |
| `prepareForVideoRecording` | not in the API | not in the API | Not covered. See the app-facing row | none |
| `startVideoRecording` / `startVideoCapturing` / `stopVideoRecording` | `CameraDevice::start_recording(RecordingOptions)` / `RecordingSession::stop()` | `device.startRecording(recordingOptions)` / `session.stop()` | Done. `VideoCaptureOptions` splits into the per-call options | `fake_backend.rs`; `device.test.tsx` |
| `pauseVideoRecording` / `resumeVideoRecording` | not in the API | not in the API | Not covered. See the app-facing row | none |
| `supportsImageStreaming` | every device has a `PreviewStream` | same | Partial. See the app-facing row | `fake_backend.rs` |
| `onStreamedFrameAvailable(options:)` | `PreviewStream::next_frame()` | `preview.nextFrame()` | Partial. Pull, not a stream subscription; `CameraImageStreamOptions` is an unused upstream placeholder | `closed_preview_has_no_frames` |
| `setFlashMode` / `setExposureMode` / `setExposurePoint` / `getMinExposureOffset` / `getMaxExposureOffset` / `getExposureOffsetStepSize` / `setExposureOffset` / `setFocusMode` / `setFocusPoint` / `getMaxZoomLevel` / `getMinZoomLevel` / `setZoomLevel` / `getSupportedVideoStabilizationModes` / `setVideoStabilizationMode` | not in the API | not in the API | Not covered. See the app-facing rows | none |
| `pausePreview` / `resumePreview` | not in the API | not in the API | Not covered. See the app-facing row | none |
| `setDescriptionWhileRecording` | not in the API | not in the API | Not covered. See `setDescription` | none |
| `buildPreview` | not in the API | not in the API | Not covered. See the app-facing row | none |
| `dispose` | `close()` | `close()` | Partial. See the app-facing row | `exactly_once.rs` |
| `setImageFileFormat(format)` | not in the API | not in the API | Not covered. The photo comes back in the platform's container; picking HEIF is a non-goal | none |
| `setJpegImageQuality(quality)` | not in the API | not in the API | Not covered. See the app-facing row | none |
| `isZeroShutterLagSupported` / `setZeroShutterLagEnabled` | not in the API | not in the API | Not covered. See the app-facing row | none |
| `getFallbackVideoStabilizationMode` (static) | not in the API | not in the API | Not covered. Part of the stabilization non-goal | none |

## Types of the platform interface

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `CameraDescription` (name, lensDirection, sensorOrientation, lensType) | `CameraInfo` | `CameraInfo` | Done. Carries the id and the position; `sensorOrientation` and `lensType` are not carried | `fake_backend.rs`; `device.test.tsx` |
| `CameraLensDirection` (front, back, external) | `CameraPosition` | `CameraPosition` | Done. The three positions | `fake_backend.rs`; `device.test.tsx` |
| `CameraLensType` (wide, telephoto, ultraWide, unknown) | not in the API | not in the API | Not covered. Lens-type picking is a non-goal; id and position are enough this release | none |
| `ResolutionPreset` (low, medium, high, veryHigh, ultraHigh, max) | `PhotoOptions.resolution` / `RecordingOptions.resolution` | `photoOptions.resolution` / `recordingOptions.resolution` | Partial. Explicit resolutions, no preset names; a resolution the device cannot deliver resolves `ERR_CAMERA_FORMAT_UNSUPPORTED` | `fake_backend.rs`; `device.test.tsx`; `unsupported_format_reports_format_unsupported` |
| `FlashMode` (off, auto, always, torch) | not in the API | not in the API | Not covered. A hardware control with no wired backend | none |
| `ExposureMode` (auto, locked) | not in the API | not in the API | Not covered. Manual capture controls wait for a native backend | none |
| `FocusMode` (auto, locked) | not in the API | not in the API | Not covered. The same | none |
| `ImageFormatGroup` (unknown, yuv420, nv21, bgra8888, jpeg) | not in the API | not in the API | Not covered. Frame data stays opaque bytes this release | none |
| `ImageFileFormat` (jpeg, heif) | not in the API | not in the API | Not covered. See `setImageFileFormat` | none |
| `VideoStabilizationMode` (off, level1, level2, level3) | not in the API | not in the API | Not covered. See the stabilization rows | none |
| `MediaSettings` (the settings class) | `RecordingOptions` and the options fields | `recordingOptions` | Partial. The field rows below carry fps and audio, and `ResolutionPreset` above the resolution; the bitrates are the non-goal | `fake_backend.rs`; `device.test.tsx` |
| `MediaSettings.fps` | `RecordingOptions.fps` | `recordingOptions.fps` | Done. The frame rate rides the recording options | `invalid_arguments_report_invalid_argument` |
| `MediaSettings.enableAudio` | `RecordingOptions.audio`, with the microphone check | `recordingOptions.audio` | Done. A decline resolves `ERR_CAMERA_MIC_PERMISSION_DENIED` and no recording starts; `audio` defaults to `false` | `mic_permission_denied_fails_recording_with_audio` |
| `MediaSettings.videoBitrate` / `MediaSettings.audioBitrate` | not in the API | not in the API | Not covered. Bitrate fields are a non-goal this release | none |
| `VideoCaptureOptions` (cameraId, streamCallback, streamOptions, maxDuration, enablePersistentRecording, videoOutputPath) | the per-call options | same | Partial. The camera is the open device; recording and streaming at once, persistent recordings and output paths are non-goals; `maxDuration` is deprecated upstream | `fake_backend.rs`; `device.test.tsx` |
| `CameraException` (code + description) | `CameraError` + `CameraErrorCode` (`ERR_CAMERA_*`) | `CameraError` | Done. The 14 kinds, their codes and what maps onto them live in [goals.md](goals.md) | `error_codes.rs` (`<snake_kind>_code_is_stable` per kind); `errors.test.tsx` |
| `CameraImageData` / `CameraImagePlane` / `CameraImageFormat` / `CameraImageStreamOptions` | not in the API | not in the API | Not covered. The platform-interface twins of `CameraImage`; plane data stays opaque | none |
| `XFile` | the photo and video bytes | same | Not covered as a type. In-memory data; file IO is the app's job | none |
| `serializeExposureMode` and friends, `ImageFormatGroupName` | not in the API | not in the API | Not covered. Dart wire helpers; our stable names live in the error table in [goals.md](goals.md) | none |

## Events

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `CameraEvent` / `DeviceEvent` (base classes) | not in the API | not in the API | Not covered. Dart event plumbing | none |
| `CameraInitializedEvent` | `Camera::open(id)` resolving | `Camera.open(id)` | Partial. No preview-size payload | `fake_backend.rs`; `camera.test.tsx` |
| `CameraResolutionChangedEvent` | not in the API | not in the API | Not covered. Resolution is chosen up front | none |
| `CameraClosingEvent` / `CameraErrorEvent` | the recording resolves `ERR_CAMERA_INTERRUPTED` at the next `stop()` | same | Done. An OS interruption — backgrounding, a phone call — surfaces at the next call, not on a stream. The fake and scripted-link tests drive this | `backgrounded_interruption_resolves_recording_as_interrupted` |
| `VideoRecordedEvent` | `RecordingSession::stop()` resolving with the bytes | `session.stop()` | Done. The event is the resolved call | `fake_backend.rs`; `device.test.tsx` |
| `DeviceOrientationChangedEvent` | `RecordingSession::orientation()` and `Frame.orientation` | `session.orientation()` / `frame.orientation` | Done. A change while recording is not an error: the session keeps running and reports the new value | `orientation_change_while_recording_updates_session` |

## The federated platform packages

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `camera_android` — classic Camera2 over a method channel | not ported | not ported | Not covered. The Android bridge follows the brief's CameraX path; the classic implementation is not ported | none |
| `camera_android_camerax` — CameraX, the brief's recommended Android path | the Android link seam, `crates/nsh-camera/src/platform/` | the same seam, through `packages/nsh-camera` | Platform only. The unwired bridge resolves `ERR_CAMERA_NOT_AVAILABLE` everywhere until the native backend lands | `android_bridge_reports_not_available` (`bridges.rs`) |
| `camera_avfoundation` — iOS and macOS AVFoundation | the Apple link seam | the same seam, through `packages/nsh-camera` | Platform only. Unwired, as above | `apple_bridge_reports_not_available` (`bridges.rs`) |
| `camera_windows` — Media Foundation | the Windows link seam, through nokhwa | the same seam, through `packages/nsh-camera` | Platform only. Unwired, as above | `windows_bridge_reports_not_available` (`bridges.rs`) |
| `camera_web` — getUserMedia; `NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError` | not in the API | not in the API | Not covered. Web is out of scope per the brief. Its failure modes map onto our codes in [goals.md](goals.md) | none |
| not in either reference | the Linux link seam, through nokhwa | the same seam, through `packages/nsh-camera` | Platform only. Unwired, as above | `linux_bridge_reports_not_available` (`bridges.rs`) |

## Devices API of react-native-vision-camera

`CameraDevices.ts` marks its functions deprecated upstream in favor of the hooks.

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `getAllCameraDevices()` | `Camera::devices()` | `Camera.devices()` | Done. A snapshot, not a live list | `fake_backend.rs`; `camera.test.tsx` |
| `getDefaultCameraDevice(position)` | pick from `Camera::devices()` by `CameraPosition` | same | Done. The caller picks; the devices carry the position | `fake_backend.rs`; `camera.test.tsx` |
| `addOnCameraDevicesChangedListener(listener)` | not in the API | not in the API | Not covered. No devices-changed listener this release | none |
| `getSupportedExtensions(device)` | not in the API | not in the API | Not covered. Vendor ISP extensions are a non-goal | none |
| `getCameraDevice(position, filter)` (+ `DeviceFilter`, `PhysicalDeviceType`) | filter `Camera::devices()` in the app | same | Done. The snapshot is the library's; ranking and filtering are the app's | `fake_backend.rs`; `camera.test.tsx` |
| `CameraDevice` (id, position, formats, the capability fields) | `CameraInfo` | `CameraInfo` | Partial. The id and the position; the capability catalogue (formats, zoom, torch, HDR, bias ranges…) is a non-goal this release | `fake_backend.rs`; `device.test.tsx` |
| `CameraDeviceFactory` (`cameraDevices`, `getCameraForId`, `getDefaultCamera`, `getSupportedExtensions`, `supportedMultiCamDeviceCombinations`) | not in the API | not in the API | Not covered. No factory object; `devices()` goes straight to the backend | none |
| `CameraExtension` / `CameraExtensionType` | not in the API | not in the API | Not covered. Extensions are a non-goal | none |

## Hooks

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `useCamera` (the `Camera` props and ref wiring) | not in the API | not in the API | Not covered. React view wiring is the NSX app's job | none |
| `useCameraDevice(position, filter)` / `useCameraDevices()` | call `Camera::devices()` when needed | `Camera.devices()` | Done. No reactive re-run on device change; see the listener row above | `fake_backend.rs`; `camera.test.tsx` |
| `useCameraDeviceExtensions(device)` | not in the API | not in the API | Not covered. Extensions are a non-goal | none |
| `useCameraPermission` / `useMicrophonePermission` (+ their `PermissionState` interface: `status`, `requestPermission`, `hasPermission`, `canRequestPermission`) | `permission()` / `request_permission()` | `permission()` / `requestPermission()` | Partial. Plain calls, no reactive hook. `hasPermission` is `permission() == Granted`; `canRequestPermission` is the state `NotDetermined`. The microphone is only checked for a recording with `audio: true` | `permission_denied_on_ios_asks_once_then_requires_settings`; `restricted_permission_maps_to_permission_restricted` |
| `useOrientation(source)` | `RecordingSession::orientation()` / `Frame.orientation` | `session.orientation()` / `frame.orientation` | Done. A pull, not a subscription; one source, what the platform reports | `orientation_change_while_recording_updates_session` |
| `usePreviewOutput()` | `PreviewStream` | `PreviewStream` | Partial. Frames only; no view to attach | `fake_backend.rs`; `closed_preview_has_no_frames` |
| `useFrameOutput(options)` | `PreviewStream::next_frame()` | `preview.nextFrame()` | Partial. One frame per call; no worklet thread, no pixel-format choice, no drop reporting | `closed_preview_has_no_frames` |
| `usePhotoOutput(options)` | `CameraDevice::capture_photo(PhotoOptions)` | `device.capturePhoto(photoOptions)` | Partial. Options per call; flash and quality-prioritization options are non-goals | `fake_backend.rs`; `device.test.tsx` |
| `useVideoOutput(options)` / `CameraVideoOutput.createRecorder(settings)` | `CameraDevice::start_recording(RecordingOptions)` / `RecordingSession::stop()` / `cancel()` | `device.startRecording(recordingOptions)` / `session.stop()` / `session.cancel()` | Partial. Options per call; codec, bitrate and file-type settings are non-goals | `fake_backend.rs`; `device.test.tsx` |
| `useDepthOutput(props)` | not in the API | not in the API | Not covered. Depth data is a non-goal | none |
| `useObjectOutput(props)` | not in the API | not in the API | Not covered. On-device scanning is a non-goal | none |
| `useFrameRenderer()` | not in the API | not in the API | Not covered. Rendering is the app's job | none |
| `useAsyncRunner()` | not in the API | not in the API | Not covered. Worklet threading is a non-goal | none |

## The `VisionCamera` factory (`CameraFactory.nitro`)

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `VisionCamera` / `createDeviceFactory()` | `Camera` | `Camera` | Done. No factory step; `devices()` goes straight to the backend | `fake_backend.rs`; `camera.test.tsx` |
| `cameraPermissionStatus` / `requestCameraPermission()` | `permission()` / `request_permission()` | `permission()` / `requestPermission()` | Partial. See the permission rows | `permission_denied_on_ios_asks_once_then_requires_settings` |
| `requestMicrophonePermission()` + RN audio (`VideoOutputOptions.enableAudio`) | `RecordingOptions.audio`, with the microphone check | `recordingOptions.audio` | Done. A decline resolves `ERR_CAMERA_MIC_PERMISSION_DENIED` and no recording starts | `mic_permission_denied_fails_recording_with_audio` |
| `microphonePermissionStatus` | not in the API | not in the API | Not covered. The microphone is only checked for a recording with `audio: true`; there is no status call | none |
| `supportsMultiCamSessions` / `createCameraSession(enableMultiCam)` | not in the API | not in the API | Not covered. One device at a time this release | none |
| `resolveConstraints(device, outputs, constraints)` (+ `Constraint`) | not in the API | not in the API | Not covered. Capability negotiation is a non-goal; pass explicit options and get `ERR_CAMERA_FORMAT_UNSUPPORTED` when they cannot be met | `unsupported_format_reports_format_unsupported` |
| `createPhotoOutput` / `createVideoOutput` / `createFrameOutput` / `createPreviewOutput` | the per-call options and the `PreviewStream` | same | Partial. No output objects to connect; see the hooks rows | `fake_backend.rs`; `device.test.tsx` |
| `createDepthFrameOutput` / `createObjectOutput` / `createOutputSynchronizer` | not in the API | not in the API | Not covered. Depth, scanning and multi-output sync are non-goals | none |
| `createZoomGestureController()` / `createTapToFocusGestureController()` | not in the API | not in the API | Not covered. Gestures live in the app | none |
| `createOrientationManager(source)` | `RecordingSession::orientation()` | `session.orientation()` | Done. See the orientation rows | `orientation_change_while_recording_updates_session` |
| `createFrameRenderer()` | not in the API | not in the API | Not covered. Rendering is the app's job | none |
| `createNormalizedMeteringPoint(x, y, size)` | not in the API | not in the API | Not covered. Metering is a non-goal | none |

## Views

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `<Camera>` (`CameraViewProps`, `CameraRef`) | not in the API | not in the API | Not covered. A preview view needs the NSH view layer; this release ships the API | none |
| `<NativePreviewView>` (+ the `PreviewView` spec) | not in the API | not in the API | Not covered. The library exposes frames only | none |
| `<NativeFrameRendererView>` (+ the `FrameRendererView` spec) | not in the API | not in the API | Not covered. The same | none |

## `CameraController.nitro`

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `configure(config)` (+ `CameraControllerConfiguration`) | `Camera::open(id)` with the options | `Camera.open(id)` | Partial. Open carries what this release carries; the exposure, focus, HDR and low-light flags in the config are non-goals | `fake_backend.rs`; `camera.test.tsx` |
| `focusTo(point, options)` / `resetFocus()` / `addSubjectAreaChangedListener` (+ `FocusOptions`) | not in the API | not in the API | Not covered. Focus control waits for a native backend | none |
| `zoom` / `minZoom` / `maxZoom` / `displayableZoomFactor` / `setZoom()` / `startZoomAnimation()` / `cancelZoomAnimation()` | not in the API | not in the API | Not covered. Nothing is wired to scale the lens | none |
| `torchMode` / `setTorchMode()` / `torchStrength` / `enableTorchWithStrength()` | not in the API | not in the API | Not covered. A hardware control with no wired backend | none |
| `exposureBias` / `setExposureBias()` / `setExposureLocked()` / `lockCurrentExposure()` / `exposureDuration` / `iso` and their min/max | not in the API | not in the API | Not covered. Manual capture controls wait for a native backend | none |
| `focusMode` / `setFocusLocked()` / `lockCurrentFocus()` / `lensPosition` | not in the API | not in the API | Not covered. The same | none |
| `whiteBalanceMode` / `whiteBalanceGains` / `setWhiteBalanceLocked()` / `lockCurrentWhiteBalance()` / `convertWhiteBalanceTemperatureAndTintValues()` | not in the API | not in the API | Not covered. White balance is a non-goal | none |
| `isUsedByAnotherApp` (with `isConnected`, `isSuspended`) | `open()` resolving `ERR_CAMERA_DEVICE_BUSY` | `Camera.open(id)` | Done. A device held elsewhere fails the open with the busy code, resolved once | `device_busy_reports_device_busy` |
| `isLowLightBoostEnabled` / `isSmoothAutoFocusEnabled` / `isDistortionCorrectionEnabled` | not in the API | not in the API | Not covered. Capture-session flags the seams do not carry | none |

## Outputs (`specs/outputs`)

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `CameraOutput` (base interface) | not in the API | not in the API | Not covered. No output objects; the options ride each call | none |
| `CameraPhotoOutput.capturePhoto()` (+ `PhotoOutputOptions`, `CapturePhotoSettings`, `CapturePhotoCallbacks`, the RN `FlashMode`, `PhotoFile`) | `CameraDevice::capture_photo(PhotoOptions)` | `device.capturePhoto(photoOptions)` | Partial. The capture itself is Done; an empty mime resolves `ERR_CAMERA_INVALID_ARGUMENT` before the device is touched, and flash or quality options are non-goals | `fake_backend.rs`; `device.test.tsx`; `invalid_arguments_report_invalid_argument` |
| `CameraPhotoOutput.capturePhotoToFile()` / `prepareSettings()` | not in the API | not in the API | Not covered. File IO is the app's job; settings are prepared inside the capture | none |
| `CameraVideoOutput` (`getSupportedVideoCodecs()`, `setOutputSettings()`, + `VideoOutputOptions`, `VideoOutputSettings`) | `RecordingOptions` | `recordingOptions` | Partial. fps, audio, resolution and orientation ride the options; codec and bitrate settings are non-goals | `fake_backend.rs`; `device.test.tsx` |
| `Recorder.startRecording(callbacks)` / `stopRecording()` | `CameraDevice::start_recording(RecordingOptions)` / `RecordingSession::stop()` | `device.startRecording(recordingOptions)` / `session.stop()` | Done. The finish callback is the resolved call; the bytes come back in memory. A recording resolves exactly once, at the first of `stop()` or `cancel()` | `fake_backend.rs`; `device.test.tsx`; `exactly_once.rs` |
| `Recorder.pauseRecording()` / `resumeRecording()` | not in the API | not in the API | Not covered. Timer semantics the seam does not model | none |
| `Recorder.cancelRecording()` | `RecordingSession::cancel()` | `session.cancel()` | Done. `cancel()` resolves the session; a later `stop()` or `cancel()` rejects `ERR_CAMERA_ALREADY_RESOLVED` | `caller_cancel_resolves_recording_as_cancelled` |
| `Recorder` progress: `isRecording`, `isPaused`, `recordedDuration`, `recordedFileSize`, `filePath` | not in the API | not in the API | Not covered. A running recording is not queried; the data is in memory, so there is no path | none |
| `RecorderSettings` (`maxDuration`, `maxFileSize`) / `RecorderFileType` | not in the API | not in the API | Not covered. Limits are the app's to enforce; the bytes are in memory | none |
| `RecordingFinishedReason`: `stopped` | `stop()` resolves `Ok` with the data | `session.stop()` | Done. A normal stop is a success, not a reason code | `fake_backend.rs`; `device.test.tsx` |
| `RecordingFinishedReason`: `max-duration-reached`, `max-file-size-reached` | not in the API | not in the API | Not covered. Auto-stops are a non-goal this release | none |
| `CameraPreviewOutput` | `PreviewStream` | `PreviewStream` | Partial. Frames, no view | `closed_preview_has_no_frames` |
| `CameraFrameOutput` (`setOnFrameCallback`, `setOnFrameDroppedCallback`) | `PreviewStream::next_frame()` | `preview.nextFrame()` | Partial. Pull, one frame at a time; drop reporting (`FrameDroppedReason`) is not modeled | `closed_preview_has_no_frames` |
| `CameraDepthFrameOutput` (+ `DepthFrameOutputOptions`) | not in the API | not in the API | Not covered. Depth data is a non-goal | none |
| `CameraObjectOutput` (+ `ObjectOutputOptions`) | not in the API | not in the API | Not covered. On-device scanning is a non-goal | none |
| `CameraOutputSynchronizer` | not in the API | not in the API | Not covered. Multi-output sync needs outputs first | none |

## Instances (`specs/instances`)

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `Frame` (timestamp, width, height, bytesPerRow, pixelFormat, orientation, isValid, …) | the frame `next_frame()` yields | the frame `nextFrame()` yields | Partial. The frame carries its bytes, its size and its orientation; planes (`FramePlane`), native buffers, mirroring and intrinsic matrices are non-goals | `fake_backend.rs`; `closed_preview_has_no_frames` |
| `Frame.getPlanes()` / `getPixelBuffer()` / `getNativeBuffer()` / point conversion | the frame's bytes | same | Not covered. Frame data stays opaque bytes this release | none |
| `Photo` (`getPixelBuffer`, `getFileData`, `saveToFileAsync`, `saveToTemporaryFileAsync`, `toImage`, `isRawPhoto`, `containerFormat`, `depth`, `calibrationData`) | the photo bytes from `capture_photo` | the photo bytes from `capturePhoto` | Partial. The bytes come back in memory; saving to a file is the app's job; raw, depth and calibration payloads are non-goals | `fake_backend.rs`; `device.test.tsx` |
| `CameraCalibrationData` | not in the API | not in the API | Not covered. Calibration matrices are a non-goal | none |
| `Depth` (accuracy, quality, filtering, conversion, `toFrame()`) | not in the API | not in the API | Not covered. Depth data is a non-goal | none |
| `ScannedObject` / `ScannedCode` / `ScannedFace` (+ `isScannedCode()`, `isScannedFace()`) | not in the API | not in the API | Not covered. On-device scanning is a non-goal | none |
| `Location` (the spec inside the main package) | not in the API | not in the API | Not covered. Geotagging is the sibling package's feature and a non-goal here | none |

## Session (`specs/session`)

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `CameraSession`: `configure()` / `start()` / `stop()` / `isRunning` | `Camera::open(id)` starts delivery; `close()` ends it | `Camera.open(id)` / `close()` | Partial. Open and close carry what this release carries; the running flag and the started/stopped listeners are not modeled | `fake_backend.rs`; `exactly_once.rs` |
| `CameraSession`: `addOnErrorListener` / `addOnInterruptionStartedListener` / `addOnInterruptionEndedListener` (+ `InterruptionReason`) | the recording resolves `ERR_CAMERA_INTERRUPTED` at the next `stop()` | same | Done. No listener; the interruption surfaces on the call, with the reason folded into one code | `backgrounded_interruption_resolves_recording_as_interrupted` |
| `CameraSessionConfig` / `CameraSessionConfiguration` / `CameraSessionConnection` / `CameraOutputConfiguration` | not in the API | not in the API | Not covered. No session-config graph; the options ride each call | none |

## Orientation, metering, gestures, frame processors, threading

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `OrientationManager` (`startOrientationUpdates`, `stopOrientationUpdates`, `currentOrientation`) | `RecordingSession::orientation()` | `session.orientation()` | Done. Pull, not push | `orientation_change_while_recording_updates_session` |
| `MeteringPoint` (relative and normalized coordinates) | not in the API | not in the API | Not covered. Metering is a non-goal | none |
| `GestureController` / `TapToFocusGestureController` / `ZoomGestureController` | not in the API | not in the API | Not covered. Gestures live in the app | none |
| `NativeThread` / `NativeThreadFactory` | not in the API | not in the API | Not covered. Worklet threading is a non-goal; frames would have to cross the native boundary | none |
| `FrameRenderer` (spec) / `FrameConverter` (spec, and `HybridFrameConverter` in utils) | not in the API | not in the API | Not covered. Frames stay opaque bytes; conversion is the app's job | none |
| `AsyncRunner` / `RuntimeThread` / `RuntimeThreadProvider` | not in the API | not in the API | Not covered. The same | none |
| `getUIRotation()` | not in the API | not in the API | Not covered. UI math is the app's | none |
| `CommonResolutions` / `CommonDynamicRanges` | not in the API | not in the API | Not covered. Resolution constants are app-side; dynamic range is a non-goal | none |

## Common types (`specs/common-types`)

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `CameraErrorCode` (the codes RN documents) | `CameraErrorCode` (`ERR_CAMERA_*`) | `CameraErrorCode` | Done. The 14 kinds and what maps onto each live in [goals.md](goals.md) | `error_codes.rs` (`<snake_kind>_code_is_stable` per kind); `errors.test.tsx` |
| `AutoFocusSystem` | not in the API | not in the API | Not covered. Focus control waits for a native backend | none |
| `CameraOrientation` (up, right, down, left) | the value `Frame.orientation` and `RecordingSession::orientation()` return | same | Done. The four values | `orientation_change_while_recording_updates_session` |
| `CameraPosition` / `TargetCameraPosition` (front, back, external; unspecified) | `CameraPosition` | `CameraPosition` | Done. The three positions; `unspecified` has no counterpart | `fake_backend.rs`; `device.test.tsx` |
| `Constraint` | not in the API | not in the API | Not covered. See `resolveConstraints` | none |
| `DepthPixelFormat` | not in the API | not in the API | Not covered. Depth data is a non-goal | none |
| `DeviceType` | not in the API | not in the API | Not covered. The device class is unused here | none |
| `DynamicRange` | not in the API | not in the API | Not covered. HDR is a non-goal | none |
| `ExposureMode` | not in the API | not in the API | Not covered. Manual capture controls wait for a native backend | none |
| `FocusMode` | not in the API | not in the API | Not covered. The same | none |
| `FocusOptions` | not in the API | not in the API | Not covered. The same | none |
| `FrameDroppedReason` | not in the API | not in the API | Not covered. No callback thread to drop frames on | none |
| `ListenerSubscription` | not in the API | not in the API | Not covered. Plain one-shot calls; no listeners | none |
| `MediaType` | not in the API | not in the API | Not covered. Unused here | none |
| `MirrorMode` (on, off, auto) | not in the API | not in the API | Not covered. Mirroring is the app's transform | none |
| `NativeBuffer` | not in the API | not in the API | Not covered. Frame bytes, not native buffers | none |
| `OrientationSource` (interface, device) | not in the API | not in the API | Not covered. One source: what the platform reports | none |
| `OutputStreamType` | not in the API | not in the API | Not covered. No output objects | none |
| `PermissionStatus` (not-determined, authorized, denied, restricted) | `PermissionState` (three states) + `ERR_CAMERA_PERMISSION_RESTRICTED` | same | Partial. Three states; restricted is an error, not a state, and `permission()` reports `Denied` for it. A permanent deny resolves `ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED`. No reactive hook; plain calls only | `permission_denied_on_ios_asks_once_then_requires_settings`; `restricted_permission_maps_to_permission_restricted` |
| `PhotoContainerFormat` | not in the API | not in the API | Not covered. The photo comes back in the platform's container | none |
| `PixelFormat` | not in the API | not in the API | Not covered. Frame data stays opaque bytes | none |
| `Point` | not in the API | not in the API | Not covered. No covered API takes a point | none |
| `QualityPrioritization` (speed, balanced, quality) | not in the API | not in the API | Not covered. No encoder sits behind the seam to prioritize | none |
| `Range` (min, max) | not in the API | not in the API | Not covered. `RecordingOptions.fps` is one number | none |
| `Size` (width, height) | the width and height inside `PhotoOptions.resolution` / `RecordingOptions.resolution` | same | Accepted. The shape is used; the standalone name is not kept | `fake_backend.rs`; `device.test.tsx` |
| `StabilizationMode` (+ `TargetStabilizationMode`) | not in the API | not in the API | Not covered. A capture-session configuration the seams do not carry | none |
| `TorchMode` (on, off) | not in the API | not in the API | Not covered. A hardware control with no wired backend | none |
| `VideoCodec` (h264, h265, pro-res variants, …) | not in the API | not in the API | Not covered. Codec choice is a non-goal | none |
| `VideoPixelFormat` | not in the API | not in the API | Not covered. Frame data stays opaque bytes | none |
| `WhiteBalanceGains` / `WhiteBalanceMode` / `WhiteBalanceTemperatureAndTint` | not in the API | not in the API | Not covered. White balance is a non-goal | none |

## Sibling packages of react-native-vision-camera

| reference API | Rust | TypeScript | Status | Covered by |
|---|---|---|---|---|
| `react-native-vision-camera-barcode-scanner` | not in the API | not in the API | Not covered. A separate package, out of scope; analyzers need frame data this release keeps opaque | none |
| `react-native-vision-camera-location` | not in the API | not in the API | Not covered. A separate package, out of scope | none |
| `react-native-vision-camera-resizer` | not in the API | not in the API | Not covered. A separate package, out of scope | none |
| `react-native-vision-camera-skia` | not in the API | not in the API | Not covered. A separate package, out of scope | none |
| `react-native-vision-camera-worklets` | not in the API | not in the API | Not covered. A separate package, out of scope; frame processors depend on it | none |

## Not in either reference

| Here | Status | Covered by |
|---|---|---|
| exactly-once resolution: a second `stop()` or `cancel()` on the same session, or any call on a closed device or preview, resolves `ERR_CAMERA_ALREADY_RESOLVED` | Done | `exactly_once.rs`; `device.test.tsx` |
