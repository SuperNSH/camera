# Goals

What this repo is building, the contract every implementation honors, and where each claim is proven. The choices behind these goals are in [decisions.md](decisions.md).

## Goal

Photo capture, video recording and live preview for Native Shell apps, as one Rust crate, `crates/nsh-camera`, and one TypeScript package, `packages/nsh-camera`, with the same API names and the same behavior. The surface: `devices()` and `open()`, `capture_photo()`, a recording through `start_recording()`, `stop()` and `cancel()`, preview frames through `next_frame()` and `close()`, permissions through `permission()` and `request_permission()`, and a running recording's orientation through `orientation()`, with `RecordingOptions.audio` carrying the microphone question.

Tests run on both sides: a behavior change lands in both, with a test in both. The layout follows SuperNSH/biometrics — root workspace, crate in `crates/`, package in `packages/`, docs here, `examples/` later.

## Platform scope

Apple through AVFoundation, Android through CameraX, Windows and Linux through nokhwa — as link-layer seams in `crates/nsh-camera/src/platform/`. No native backend is wired this release: every unwired link resolves `ERR_CAMERA_NOT_AVAILABLE`, because no capture service exists on this platform until a native backend lands.

Web stays out of scope. `docs/brief.md` names no web camera option — `camera_web` exists in the Flutter reference, but the brief's recommended path has no web. It is enumerated in `docs/parity.md` only to say Not covered.

## The exactly-once contract

Every implementation, real or fake, honors these rules.

- Each call resolves exactly once: success, a coded failure, or a cancel. It never hangs and never panics.
- A recording resolves at the first of `stop()` or `cancel()`. A later `stop()` or `cancel()` on the same session resolves `ERR_CAMERA_ALREADY_RESOLVED`. A `stop()` that returns `Err` — `ERR_CAMERA_INTERRUPTED`, for example — also resolves the session; a `cancel()` after it is `ERR_CAMERA_ALREADY_RESOLVED`.
- One recording per device at a time. `start_recording` while one runs resolves `ERR_CAMERA_IN_PROGRESS`; Flutter throws `A video recording is already started` for the same case.
- A device's `close()` resolves once, `Ok` on success. Any later call on that device resolves `ERR_CAMERA_ALREADY_RESOLVED`.
- A preview's `close()` resolves once. `next_frame()` after close resolves `ERR_CAMERA_ALREADY_RESOLVED`; `next_frame()` with no frame available resolves `ERR_CAMERA_NOT_AVAILABLE`.
- Permission asks once on iOS, and after that only Settings can change it. `request_permission()` from `NotDetermined` asks once: a grant resolves `Ok(Granted)`; a decline resolves `Err(ERR_CAMERA_PERMISSION_DENIED)` and the state becomes `Denied` permanently. `request_permission()` while already `Denied` resolves `Err(ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED)`. A restricted device (parental controls) resolves `Err(ERR_CAMERA_PERMISSION_RESTRICTED)`, and `permission()` reports `Denied` for it. `permission()` only reports the state; it never asks.
- `devices()` returns the platform list, `Ok` with an empty vec when none are present. `open()` with an id matching no device resolves `Err(ERR_CAMERA_NOT_AVAILABLE)`; a device held elsewhere resolves `Err(ERR_CAMERA_DEVICE_BUSY)`.
- `capture_photo` with a resolution, mime or fps the device cannot deliver resolves `Err(ERR_CAMERA_FORMAT_UNSUPPORTED)`. An empty id, an empty mime or a zero fps resolves `Err(ERR_CAMERA_INVALID_ARGUMENT)` before the device is touched.
- Recording with `audio: true` checks the microphone permission first; a decline resolves `Err(ERR_CAMERA_MIC_PERMISSION_DENIED)` and no recording starts. `audio` defaults to `false`.
- An orientation change while recording is not an error: the session keeps running and `orientation()` reports the new value. A locked orientation the platform cannot honor fails the recording at start with `Err(ERR_CAMERA_ORIENTATION_UNSUPPORTED)`.
- An OS interruption while recording — the app backgrounded, a phone call — surfaces at `stop()` as `Err(ERR_CAMERA_INTERRUPTED)`.
- A link layer that is not wired resolves `Err(ERR_CAMERA_NOT_AVAILABLE)` everywhere.

## The error table

`crates/nsh-camera/src/error.rs` and `packages/nsh-camera/src/errors.ts` define exactly these 14 kinds and stable codes, no more and no fewer. The Meaning column is the exact sentence the Rust `Display` writes and the TypeScript `MESSAGES` object carries, word for word.

| Kind | Code | Meaning | What maps onto it |
|---|---|---|---|
| `NotAvailable` | `ERR_CAMERA_NOT_AVAILABLE` | No camera matches here: no device, an unknown id, or no capture service on this platform. | getUserMedia `NotFoundError`; a simulator with no camera; `open()` with an unknown id; any call through an unwired link |
| `PermissionDenied` | `ERR_CAMERA_PERMISSION_DENIED` | The camera permission was declined. Grant it in the system settings. | a declined first ask on iOS or Android; getUserMedia `NotAllowedError`; React Native's `denied` |
| `PermissionPermanentlyDenied` | `ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED` | The camera permission was permanently declined. Only the system settings can grant it. | React Native's `deniedForever`; Android's don't-ask-again; `request_permission()` after the state became `Denied` |
| `PermissionRestricted` | `ERR_CAMERA_PERMISSION_RESTRICTED` | The camera permission is restricted, for example by parental controls, and cannot be requested. | iOS `.restricted` from `AVCaptureDevice.authorizationStatus` |
| `MicPermissionDenied` | `ERR_CAMERA_MIC_PERMISSION_DENIED` | The microphone permission was declined, and the recording asked for audio. | a microphone decline with `RecordingOptions.audio: true` — iOS record permission denied, Android `RECORD_AUDIO` denied; no recording starts |
| `DeviceBusy` | `ERR_CAMERA_DEVICE_BUSY` | The camera is in use by another app or process. | getUserMedia `NotReadableError`; Android `MAX_CAMERAS_IN_USE`; a camera another app holds |
| `FormatUnsupported` | `ERR_CAMERA_FORMAT_UNSUPPORTED` | The device cannot deliver the requested format, resolution, or frame rate. | getUserMedia `OverconstrainedError`; a resolution, mime or fps with no matching device format |
| `InProgress` | `ERR_CAMERA_IN_PROGRESS` | Another recording is already running on this device. | Flutter's `A video recording is already started`; a second `start_recording` on the same device |
| `Interrupted` | `ERR_CAMERA_INTERRUPTED` | The recording was interrupted, for example by backgrounding the app or a phone call. | an `AVCaptureSession` interruption (phone call, backgrounding), surfaced at `stop()`; any OS interruption of a running session |
| `OrientationUnsupported` | `ERR_CAMERA_ORIENTATION_UNSUPPORTED` | This platform cannot honor the requested recording orientation. | a locked orientation the platform cannot honor, refused at recording start |
| `Cancelled` | `ERR_CAMERA_CANCELLED` | The recording was cancelled before it finished. | nothing this release — reserved for a future cancel-before-finish surfacing; `cancel()` resolves `Ok`/void, and a later call gets `ERR_CAMERA_ALREADY_RESOLVED` |
| `Backend` | `ERR_CAMERA_BACKEND` | The platform's camera service failed. | Android `CameraAccessException` beyond the named cases; any unexpected platform failure; the TypeScript `asCameraError` fallback for unknown errors |
| `InvalidArgument` | `ERR_CAMERA_INVALID_ARGUMENT` | An argument is empty or not allowed on this platform. | an empty device id; an empty mime; a zero fps — all refused before the device is touched |
| `AlreadyResolved` | `ERR_CAMERA_ALREADY_RESOLVED` | The operation already resolved; it cannot resolve again. | a second `stop()` or `cancel()` on the same session; any call on a closed device; `next_frame()` after preview close |

## The edge-case table

Every reference edge case, mapped to its named test on both sides. The names are the contract: the Rust function in `crates/nsh-camera/tests/edge_cases.rs` and the TypeScript title in `packages/nsh-camera/tests/edge-cases.test.tsx` are exactly these.

| Edge case | Rust test | TypeScript test |
|---|---|---|
| iOS asks once, then only Settings can change the permission | `permission_denied_on_ios_asks_once_then_requires_settings` | `permission_denied_on_ios_asks_once_then_requires_settings` |
| A restricted device (parental controls) | `restricted_permission_maps_to_permission_restricted` | `restricted_permission_maps_to_permission_restricted` |
| A simulator with no camera | `simulator_without_camera_reports_not_available` | `simulator_without_camera_reports_not_available` |
| The camera is held by another app or process | `device_busy_reports_device_busy` | `device_busy_reports_device_busy` |
| The microphone is declined for a recording with audio | `mic_permission_denied_fails_recording_with_audio` | `mic_permission_denied_fails_recording_with_audio` |
| The orientation changes while a recording runs | `orientation_change_while_recording_updates_session` | `orientation_change_while_recording_updates_session` |
| A locked orientation the platform cannot honor | `orientation_lock_platform_cannot_honor_is_orientation_unsupported` | `orientation_lock_platform_cannot_honor_is_orientation_unsupported` |
| The app is backgrounded mid-recording, or a call arrives | `backgrounded_interruption_resolves_recording_as_interrupted` | `backgrounded_interruption_resolves_recording_as_interrupted` |
| The caller cancels the recording | `caller_cancel_resolves_recording_as_cancelled` | `caller_cancel_resolves_recording_as_cancelled` |
| A second recording starts while the first runs | `second_recording_while_first_runs_is_in_progress` | `second_recording_while_first_runs_is_in_progress` |
| The device cannot deliver the requested format | `unsupported_format_reports_format_unsupported` | `unsupported_format_reports_format_unsupported` |
| A closed preview has no frames | `closed_preview_has_no_frames` | `closed_preview_has_no_frames` |
| An empty id, an empty mime or a zero fps | `invalid_arguments_report_invalid_argument` | `invalid_arguments_report_invalid_argument` |

## Acceptance criteria

These are the finish conditions, not a status report; `docs/parity.md` tracks what CI has actually run.

| Criterion | Proven by |
|---|---|
| One stable code per failure mode, the same 14 on both sides | `crates/nsh-camera/tests/error_codes.rs`; `packages/nsh-camera/tests/errors.test.tsx` |
| Every call resolves exactly once, and later calls on a resolved operation get `ERR_CAMERA_ALREADY_RESOLVED` | `crates/nsh-camera/tests/exactly_once.rs`; `packages/nsh-camera/tests/device.test.tsx` |
| The reference edge cases behave as mapped above | the edge-case table |
| Scripted fake and memory backends drive the whole surface without a device | `crates/nsh-camera/tests/fake_backend.rs`; `packages/nsh-camera/tests/camera.test.tsx` and `packages/nsh-camera/tests/device.test.tsx` |
| Every unwired bridge resolves `ERR_CAMERA_NOT_AVAILABLE` | `crates/nsh-camera/tests/bridges.rs`: `apple_bridge_reports_not_available`, `android_bridge_reports_not_available`, `windows_bridge_reports_not_available`, `linux_bridge_reports_not_available` |
| Rust gates and the TypeScript typecheck, build and test pass | `.github/workflows/ci.yml`, which never runs on a developer machine |

## Non-goals

- Torch and flash: a hardware control with no wired native backend to run it.
- Zoom: same — nothing is wired to scale the lens.
- Exposure and focus control: manual capture controls wait for a native backend.
- White balance: the same.
- Video stabilization: a capture-session configuration the seams do not carry yet.
- Zero-shutter-lag: an Android capture mode that needs CameraX wired.
- JPEG quality control: no encoder sits behind the seam yet.
- YUV plane access: frame data stays opaque bytes this release.
- Preview pause/resume: a preview has `next_frame()` and `close()`; a pause is the app not calling `next_frame()`.
- Video pause/resume: a session resolves exactly once, and pause/resume would add mid-session states the references disagree on.
- Max-duration and max-file-size auto-stops: the data lives in memory, so limits are the app's to enforce.
- Persistent recording: the library returns bytes and writes nothing (see [decisions.md](decisions.md)).
- File-path output: no filesystem in the seam keeps it testable on every runner (see [decisions.md](decisions.md)).
- Reactive hooks and signals: the surface is commands and one-shot reads; no camera state streams to a view.
- The `<Camera>` preview widget: a preview view needs the NSH view layer in hand; this release ships the API.
- Frame processors and worklet threading: frames would have to cross the native boundary, and the native binding is pinned, not wired (see [decisions.md](decisions.md)).
- Barcode, depth, location, skia and resizer analyzers: they run on frame data, which stays opaque this release.
- Web platform: `docs/brief.md` names no web camera option.
- The native TSX binding: pinned but not wired (see [decisions.md](decisions.md)).

## References

The STEP 0 reference table — which checkouts were cloned, and what each is for — lives in [decisions.md](decisions.md). `docs/brief.md` holds the research brief this area grew from.
