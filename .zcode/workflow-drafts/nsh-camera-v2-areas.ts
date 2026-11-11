// nsh-camera v2, per the STEP 0 addendum: a Rust crate AND a TypeScript package laid out
// like SuperNSH/biometrics (.refs/biometrics), same API names and behavior in both,
// parity.md enumerating every public API of the Flutter and React Native references,
// error codes and edge cases covering everything the references handle, and ci.yml
// running the Rust gates plus TS typecheck and tests.
//
// Twelve areas with disjoint files run in parallel; each area's chain is implement ->
// audit rounds (up to 3, until zero findings) inside its own callback. CI runs all
// compiling and testing (AGENTS.md); the only local deterministic gate is the
// rustfmt formatter (formatter-only, never a build). No cargo, rustc, tsc, nsh, or
// npm here. No git operations. The whole API contract (codes, types, methods, test
// names, parity checklists) was locked from reading .refs/ before the run.

const MODELS = {
  pro: model("account:zai-individual-coding-plan/GLM-5.3$high"),
};

const KIT = "/Users/hmziq/ZCodeProject/ai/harness/zcode/agents";
const REPO = "/Users/hmziq/fo/nsh-camera";

interface AuditFinding {
  /** File and line when it applies, e.g. "crates/nsh-camera/src/error.rs:42". */
  where: string;
  /** One sentence: what is wrong. */
  problem: string;
  /** "high" only when it would fail a CI gate or break the locked contract. */
  severity: "low" | "medium" | "high";
}

interface Audit {
  /** Actionable findings only; an empty array means the area passed. No PASS notes. */
  issues: AuditFinding[];
  /** One sentence copied VERBATIM from your instructions that most shaped the review. */
  contractLine?: string;
}

interface ImplResult {
  /** True when every owned file was written as planned. */
  done: boolean;
  /** One or two sentences: what was implemented. */
  summary: string;
  /** Anything planned but not delivered, with the reason. */
  blockers?: string[];
  /** One sentence copied VERBATIM from your instructions that most shaped the work. */
  contractLine?: string;
}

interface FixResult {
  /** True when every finding was addressed. */
  done: boolean;
  /** One or two sentences: what changed. */
  summary: string;
  /** One sentence copied VERBATIM from your instructions that most shaped the fix. */
  contractLine?: string;
}

interface AreaResult {
  name: string;
  status: "done" | "not-converged" | "failed";
  summary: string;
  /** Audit rounds actually run, including the clean round when it converged. */
  rounds: number;
  /** Findings that remained when the cap hit; empty when converged or failed. */
  remainingIssues: string[];
  /** Whether the specialist persona delivery was verified (null when no specialist). */
  personaVerified: boolean | null;
  blockers: string[];
}

interface ReportedFinding {
  where: string;
  what: string;
  evidence: string;
  status: "verified" | "unconfirmed";
  severity: "low" | "medium" | "high";
}

interface AreaSpec {
  name: string;
  title: string;
  /** Specialist agent file name without .md, or null for a plain persona. */
  specialist: string | null;
  oneLine: string;
  files: string[];
  /** Rust files the script's rustfmt --check gate covers; empty for non-Rust areas. */
  fmtFiles: string[];
  implementAsk: string;
  auditBrief: string;
}

artifact.board("areas", {
  key: "name",
  status: "phase",
  columns: ["implementing", "auditing", "fixing", "done", "failed", "not converged"],
});

// ---------------------------------------------------------------- locked contract

const STEP0_REFS = [
  "STEP 0 reference set (cloned by the orchestrator; every path below exists). Record this table in docs/decisions.md:",
  "  .refs/flutter-packages — flutter/packages, shallow sparse clone. At HEAD the camera plugin lives under packages/camera/ as a parent of the federated packages: camera (app-facing), camera_platform_interface, camera_android, camera_android_camerax, camera_avfoundation, camera_web, camera_windows.",
  "  .refs/react-native-vision-camera — mrousavy/react-native-vision-camera. The package lives at packages/react-native-vision-camera (src/ index.ts re-exports devices, hooks, nitro specs, views, threading, utils; VisionCamera factory).",
  "  .refs/expo — sparse clone of packages/expo-camera only. Reference-only per docs/brief.md; NOT part of the parity contract.",
  "  .refs/nokhwa — l1npengtul/nokhwa. The future desktop backend; no version pinned this release.",
  "  .refs/nsh — longbridge/nsh. Rust crates under crates/ (nsh-core, nsh-js, nsh-testing, nsh-engine, platform crates); TSX apps import \"nsh\" (mount, signal, Text, View) and \"nsh/test\" (test, expect).",
  "  .refs/biometrics — SuperNSH/biometrics, the org layout exemplar this repo now mirrors: root Cargo.toml workspace with crates/nsh-biometrics, packages/nsh-biometrics (TSX package with nsh.json, App.tsx, src/, tests/), docs/{brief,decisions,parity}.md, .github/workflows/ci.yml (format + rust + typescript jobs).",
].join("\n");

const ERROR_CONTRACT = [
  "crates/nsh-camera/src/error.rs and packages/nsh-camera/src/errors.ts define exactly these kinds and stable codes. Rust: #[non_exhaustive] #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)] pub enum ErrorKind; pub struct CameraError { kind: ErrorKind, status: Option<i64> } with CameraError::new(kind), with_status(i64) -> Self (builder), kind(), status(), code() -> &'static str; ErrorKind::code(self) -> &'static str; ErrorKind::message(self) -> &'static str; impl fmt::Display writing \"{code}: {message}\"; impl std::error::Error. Std-only: NO thiserror, NO dependencies. kind -> code -> message (the TS MESSAGES object must carry the SAME message strings):",
  "  NotAvailable            -> ERR_CAMERA_NOT_AVAILABLE -> \"No camera matches here: no device, an unknown id, or no capture service on this platform.\"",
  "  PermissionDenied        -> ERR_CAMERA_PERMISSION_DENIED -> \"The camera permission was declined. Grant it in the system settings.\"",
  "  PermissionPermanentlyDenied -> ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED -> \"The camera permission was permanently declined. Only the system settings can grant it.\"",
  "  PermissionRestricted    -> ERR_CAMERA_PERMISSION_RESTRICTED -> \"The camera permission is restricted, for example by parental controls, and cannot be requested.\"",
  "  MicPermissionDenied     -> ERR_CAMERA_MIC_PERMISSION_DENIED -> \"The microphone permission was declined, and the recording asked for audio.\"",
  "  DeviceBusy              -> ERR_CAMERA_DEVICE_BUSY -> \"The camera is in use by another app or process.\"",
  "  FormatUnsupported       -> ERR_CAMERA_FORMAT_UNSUPPORTED -> \"The device cannot deliver the requested format, resolution, or frame rate.\"",
  "  InProgress              -> ERR_CAMERA_IN_PROGRESS -> \"Another recording is already running on this device.\"",
  "  Interrupted             -> ERR_CAMERA_INTERRUPTED -> \"The recording was interrupted, for example by backgrounding the app or a phone call.\"",
  "  OrientationUnsupported  -> ERR_CAMERA_ORIENTATION_UNSUPPORTED -> \"This platform cannot honor the requested recording orientation.\"",
  "  Cancelled               -> ERR_CAMERA_CANCELLED -> \"The recording was cancelled before it finished.\"",
  "  Backend                 -> ERR_CAMERA_BACKEND -> \"The platform's camera service failed.\"",
  "  InvalidArgument         -> ERR_CAMERA_INVALID_ARGUMENT -> \"An argument is empty or not allowed on this platform.\"",
  "  AlreadyResolved         -> ERR_CAMERA_ALREADY_RESOLVED -> \"The operation already resolved; it cannot resolve again.\"",
  "TypeScript: export type CameraErrorCode = the 14 code strings as a union; class CameraError extends Error with readonly code: CameraErrorCode and name \"CameraError\"; const MESSAGES: Record<CameraErrorCode, string> with the same sentences; export function cameraError(code: CameraErrorCode): CameraError; export function asCameraError(error: unknown): CameraError that passes CameraError through and maps anything unknown to ERR_CAMERA_BACKEND.",
].join("\n");

const TYPES_CONTRACT = [
  "crates/nsh-camera/src/options.rs and packages/nsh-camera/src/options.ts define exactly these public items. Rust derives: Debug, Clone, PartialEq, Eq (the three enums also Copy, Hash); Default impls on PhotoOptions and RecordingOptions. TypeScript mirrors the same names in camelCase; ids are plain strings on the TS side:",
  "  enum CameraPosition { Front, Back, External }                    | type CameraPosition = \"front\" | \"back\" | \"external\"",
  "  enum PermissionState { NotDetermined, Granted, Denied }          | type PermissionState = \"not-determined\" | \"granted\" | \"denied\"   // restricted surfaces as ERR_CAMERA_PERMISSION_RESTRICTED on request; the state reports Denied",
  "  enum Orientation { PortraitUp, LandscapeLeft, LandscapeRight, PortraitDown } | type Orientation = \"portrait-up\" | \"landscape-left\" | \"landscape-right\" | \"portrait-down\"",
  "  struct CameraId(pub String)                                      | id: string",
  "  struct CameraInfo { pub id: CameraId, pub name: String, pub position: CameraPosition } | interface CameraInfo { id: string; name: string; position: CameraPosition }",
  "  struct Resolution { pub width: u32, pub height: u32 }            | interface Resolution { width: number; height: number }",
  "  struct PhotoOptions { pub resolution: Option<Resolution>, pub mime: Option<&'static str> } | interface PhotoOptions { resolution?: Resolution; mime?: string }   // mime None defaults to \"image/jpeg\"; heif is the other value Flutter names",
  "  struct Photo { pub data: Vec<u8>, pub mime: &'static str, pub resolution: Resolution, pub orientation: Orientation } | interface Photo { data: Uint8Array; mime: string; resolution: Resolution; orientation: Orientation }",
  "  struct RecordingOptions { pub resolution: Option<Resolution>, pub fps: Option<u32>, pub mime: Option<&'static str>, pub audio: bool, pub orientation: Option<Orientation> } | interface RecordingOptions { resolution?: Resolution; fps?: number; mime?: string; audio?: boolean; orientation?: Orientation }   // mime None defaults to \"video/mp4\"; audio defaults false; orientation None follows the device; a set orientation locks it and a platform that cannot honor it fails ERR_CAMERA_ORIENTATION_UNSUPPORTED",
  "  struct Recording { pub data: Vec<u8>, pub mime: &'static str, pub resolution: Resolution } | interface Recording { data: Uint8Array; mime: string; resolution: Resolution }",
  "  struct Frame { pub data: Vec<u8>, pub resolution: Resolution, pub orientation: Orientation } | interface Frame { data: Uint8Array; resolution: Resolution; orientation: Orientation }",
].join("\n");

const SEAM_CONTRACT = [
  "The backend seam mirrors the biometrics exemplar (crates/nsh-biometrics/src/backend.rs): raw platform access behind traits; the high-level types add the rules. Rust (crates/nsh-camera/src/backend.rs), all traits Send + Sync, all methods &self (impls keep interior state in Arc<Mutex<...>> like FakeBackend does) and all methods non-blocking: they return immediately and never wait on the OS, a thread, or a channel:",
  "  pub trait Backend: Send + Sync {",
  "      fn permission(&self) -> Result<PermissionState, CameraError>;",
  "      fn request_permission(&self) -> Result<PermissionState, CameraError>;",
  "      fn devices(&self) -> Result<Vec<CameraInfo>, CameraError>;",
  "      fn open_device(&self, id: &CameraId) -> Result<Box<dyn DeviceBackend>, CameraError>;",
  "  }",
  "  pub trait DeviceBackend: Send + Sync {",
  "      fn capture_photo(&self, options: &PhotoOptions) -> Result<Photo, CameraError>;",
  "      fn start_preview(&self) -> Result<Box<dyn PreviewBackend>, CameraError>;",
  "      fn start_recording(&self, options: &RecordingOptions) -> Result<Box<dyn RecordingBackend>, CameraError>;",
  "      fn close(&self) -> Result<(), CameraError>;",
  "  }",
  "  pub trait PreviewBackend: Send + Sync {",
  "      fn next_frame(&self) -> Result<Frame, CameraError>;",
  "      fn close(&self) -> Result<(), CameraError>;",
  "  }",
  "  pub trait RecordingBackend: Send + Sync {",
  "      fn orientation(&self) -> Orientation;",
  "      fn stop(&self) -> Result<Recording, CameraError>;",
  "      fn cancel(&self) -> Result<(), CameraError>;",
  "  }",
  "The returned boxes are 'static: backends own their platform link through Arc (interior mutability), so no borrowed lifetimes cross the trait. TypeScript (packages/nsh-camera/src/backend.ts) mirrors the same four interfaces promise-based: CameraBackend { permission(): Promise<PermissionState>; requestPermission(): Promise<PermissionState>; devices(): Promise<CameraInfo[]>; openDevice(id: string): Promise<CameraDeviceBackend> } ; CameraDeviceBackend { capturePhoto(options?: PhotoOptions): Promise<Photo>; startPreview(): Promise<PreviewBackend>; startRecording(options?: RecordingOptions): Promise<RecordingSessionBackend>; close(): Promise<void> } ; PreviewBackend { nextFrame(): Promise<Frame>; close(): Promise<void> } ; RecordingSessionBackend { orientation(): Orientation; stop(): Promise<Recording>; cancel(): Promise<void> }.",
].join("\n");

const HIGH_LEVEL_CONTRACT = [
  "The high-level types add the rules on top of the seam, mirroring how biometrics' LocalAuth adds its gate. Rust camera.rs and device.rs; TypeScript camera.ts and device.ts, promise-based, the SAME names camelCased:",
  "  Camera::new() -> Camera                                   | new Camera()          // an unsupported backend: every call resolves Err(ERR_CAMERA_NOT_AVAILABLE), because no native link is wired this release",
  "  Camera::with_backend(Arc<dyn Backend>) -> Camera           | new Camera({ backend })   // tests, fakes, and the platform bridges opt in here",
  "  Camera::permission(&self)                                  | permission(): Promise<PermissionState>",
  "  Camera::request_permission(&self)                          | requestPermission(): Promise<PermissionState>",
  "  Camera::devices(&self)                                     | devices(): Promise<CameraInfo[]>",
  "  Camera::open(&self, id: &CameraId) -> Result<CameraDevice, CameraError> | open(id: string): Promise<CameraDevice>",
  "  CameraDevice::capture_photo(&self, options: &PhotoOptions) | capturePhoto(options?: PhotoOptions): Promise<Photo>",
  "  CameraDevice::start_preview(&self) -> Result<PreviewStream, CameraError> | startPreview(): Promise<PreviewStream>",
  "  CameraDevice::start_recording(&self, options: &RecordingOptions) -> Result<RecordingSession, CameraError> | startRecording(options?: RecordingOptions): Promise<RecordingSession>",
  "  CameraDevice::close(&self) -> Result<(), CameraError>      | close(): Promise<void>",
  "  PreviewStream::next_frame(&self) -> Result<Frame, CameraError> | nextFrame(): Promise<Frame>",
  "  PreviewStream::close(&self) -> Result<(), CameraError>     | close(): Promise<void>",
  "  RecordingSession::orientation(&self) -> Orientation        | orientation(): Orientation",
  "  RecordingSession::stop(&self) -> Result<Recording, CameraError> | stop(): Promise<Recording>",
  "  RecordingSession::cancel(&self) -> Result<(), CameraError> | cancel(): Promise<void>",
  "Rust structs keep their rules in Arc<Mutex<...>> state shared with the sessions they return (closed flags, one-recording flag, resolved flags). TS classes keep the same rules in closures. The TS gate mirrors the Rust gate exactly, like biometrics' decisions say.",
].join("\n");

const SEMANTICS_CONTRACT = [
  "Exactly-once and mapping semantics every implementation honors:",
  "- Each call resolves exactly once: success, a coded failure, or a cancel. It never hangs and never panics.",
  "- Recording: the first of stop() or cancel() resolves it. Later stop()/cancel() on the same session resolve ERR_CAMERA_ALREADY_RESOLVED. stop() returning Err (for example ERR_CAMERA_INTERRUPTED) also resolves the session; cancel() afterwards is ERR_CAMERA_ALREADY_RESOLVED.",
  "- One recording per device at a time: start_recording while one runs resolves ERR_CAMERA_IN_PROGRESS (Flutter throws 'A video recording is already started').",
  "- Device close() resolves once, Ok on success. Any later call on that device resolves ERR_CAMERA_ALREADY_RESOLVED.",
  "- Preview close() resolves once. next_frame() after close resolves ERR_CAMERA_ALREADY_RESOLVED; next_frame() with no frame available resolves ERR_CAMERA_NOT_AVAILABLE.",
  "- Permission flow (iOS asks once, then only Settings can change it): request_permission() from NotDetermined asks once: grant -> Ok(Granted); decline -> Err(ERR_CAMERA_PERMISSION_DENIED) and the state becomes Denied permanently. request_permission() while already Denied resolves Err(ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED). A restricted device (parental controls) resolves Err(ERR_CAMERA_PERMISSION_RESTRICTED); permission() reports Denied for it. permission() only reports the state, never asks.",
  "- devices() returns the platform list (Ok with an empty vec when none are present). open() with an id matching no device resolves Err(ERR_CAMERA_NOT_AVAILABLE); a device held elsewhere resolves Err(ERR_CAMERA_DEVICE_BUSY).",
  "- capture_photo with a resolution, mime, or fps the device cannot deliver resolves Err(ERR_CAMERA_FORMAT_UNSUPPORTED). An empty id or an empty mime resolves Err(ERR_CAMERA_INVALID_ARGUMENT) before the device is touched.",
  "- Recording with audio: true checks the microphone permission first; declined resolves Err(ERR_CAMERA_MIC_PERMISSION_DENIED) and no recording starts. audio defaults to false.",
  "- Orientation changes while recording are not errors: the session keeps running and orientation() reports the new value. A locked orientation the platform cannot honor fails the recording at start with Err(ERR_CAMERA_ORIENTATION_UNSUPPORTED).",
  "- An OS interruption while recording (app backgrounded, phone call) surfaces at stop() as Err(ERR_CAMERA_INTERRUPTED).",
  "- A link layer that is not wired resolves Err(ERR_CAMERA_NOT_AVAILABLE) everywhere: no capture service exists on this platform until a native backend lands.",
].join("\n");

const FAKE_CONTRACT = [
  "crates/nsh-camera/src/fake.rs provides FakeBackend (pub), a scripted Backend whose device, preview, and recording types are also pub. State lives in Arc<Mutex<FakeState>>; ALL scripting methods take &self so a test can script while device handles are alive. Every lock is short-lived inside one method, so it cannot poison; note that constraint in a 1-2 line comment.",
  "FakeBackend::new() and Default: permission NotDetermined, empty device list, nothing queued, no failures scripted.",
  "Scripting methods (all pub, all &self):",
  "  grant_permission()             request_permission -> Ok(Granted)",
  "  deny_permission_once()         first request_permission -> Err(ERR_CAMERA_PERMISSION_DENIED) and state Denied; any later request_permission -> Err(ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED)",
  "  deny_permission_permanently()  request_permission -> Err(ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED) immediately and always",
  "  restrict_permission()          request_permission -> Err(ERR_CAMERA_PERMISSION_RESTRICTED); permission() reports Denied",
  "  with_devices(Vec<CameraInfo>)  devices() returns exactly these",
  "  fail_open_with(CameraError)    the next open_device resolves Err(that), one-shot",
  "  deny_microphone()              a recording with audio: true resolves Err(ERR_CAMERA_MIC_PERMISSION_DENIED) until cleared",
  "  queue_photo(Photo)             capture_photo returns this photo (FIFO) instead of the synthesized default",
  "  fail_capture_with(CameraError) the next capture_photo resolves Err(that), one-shot",
  "  queue_frames(Vec<Frame>)       next_frame pops frames FIFO; empty queue -> Err(ERR_CAMERA_NOT_AVAILABLE)",
  "  set_orientation(Orientation)   the active recording's orientation() reports it (no error: recording keeps running)",
  "  fail_recording_with(CameraError) the next start_recording resolves Err(that), one-shot (for ERR_CAMERA_ORIENTATION_UNSUPPORTED and ERR_CAMERA_FORMAT_UNSUPPORTED scripts)",
  "  interrupt_recording()          the next stop() resolves Err(ERR_CAMERA_INTERRUPTED) and the recording counts as resolved, one-shot",
  "  fail_stop_with(CameraError)    the next stop() resolves Err(that), one-shot",
  "  queue_recording_data(Vec<u8>)  the next stop()'s Recording.data",
  "Default behaviors: request_permission with no script -> Ok(Granted). devices() with no script -> Ok(empty). open_device with an id not in the scripted list -> Err(ERR_CAMERA_NOT_AVAILABLE). capture_photo with no queued photo -> Ok(Photo synthesized from the options: empty data, the resolved mime, the requested resolution or 1920x1080, orientation PortraitUp). stop() with no interruption script -> Ok(Recording synthesized from the options, with the queued data if any). The FakeDevice enforces the one-recording rule and every exactly-once rule in the semantics contract.",
  "packages/nsh-camera/src/memory.ts provides the TS mirror: memoryBackend(config?) -> MemoryCamera, a scripted CameraBackend with the SAME scripting surface camelCased (grantPermission(), denyPermissionOnce(), denyPermissionPermanently(), restrictPermission(), withDevices(devices), failOpenWith(code), denyMicrophone(), queuePhoto(photo), failCaptureWith(code), queueFrames(frames), setOrientation(orientation), failRecordingWith(code), interruptRecording(), failStopWith(code), queueRecordingData(data)) plus test counters (prompts() is not needed; expose recordings() and closes()). Promises reject with cameraError(code). The MemoryDevice enforces the same rules.",
].join("\n");

const EDGE_TESTS = [
  "crates/nsh-camera/tests/edge_cases.rs must define exactly these test functions, and packages/nsh-camera/tests/edge-cases.test.tsx must define a test whose title is EXACTLY each name (the names are part of the docs contract; docs/goals.md maps every reference edge case to one of them):",
  "  permission_denied_on_ios_asks_once_then_requires_settings",
  "  restricted_permission_maps_to_permission_restricted",
  "  simulator_without_camera_reports_not_available",
  "  device_busy_reports_device_busy",
  "  mic_permission_denied_fails_recording_with_audio",
  "  orientation_change_while_recording_updates_session",
  "  orientation_lock_platform_cannot_honor_is_orientation_unsupported",
  "  backgrounded_interruption_resolves_recording_as_interrupted",
  "  caller_cancel_resolves_recording_as_cancelled",
  "  second_recording_while_first_runs_is_in_progress",
  "  unsupported_format_reports_format_unsupported",
  "  closed_preview_has_no_frames",
  "  invalid_arguments_report_invalid_argument",
  "crates/nsh-camera/tests/bridges.rs must define exactly: apple_bridge_reports_not_available, android_bridge_reports_not_available, windows_bridge_reports_not_available, linux_bridge_reports_not_available.",
].join("\n");

const RUST_TESTS_CONTRACT = [
  "crates/nsh-camera/tests/ holds five integration test files. They use only the crate's public API: use nsh_camera::{...} — trait methods need the trait in scope (Backend is not needed by tests; Camera, CameraDevice, PreviewStream, RecordingSession, FakeBackend, CameraError, and every options type are).",
  "tests/error_codes.rs: one test per kind asserting code() equals the locked string (14 tests) plus one test that Display contains the code. Name pattern: <snake_kind>_code_is_stable.",
  "tests/exactly_once.rs: cancel then stop -> AlreadyResolved; double cancel -> AlreadyResolved; stop then cancel -> AlreadyResolved; interrupted stop then cancel -> AlreadyResolved; capture after device close -> AlreadyResolved; device close twice -> AlreadyResolved; next_frame after preview close -> AlreadyResolved.",
  "tests/edge_cases.rs: the locked names above. Mapping: permission_denied_on_ios... -> deny_permission_once(): first request Err(PermissionDenied), permission() Denied, next request Err(PermissionPermanentlyDenied). restricted_... -> restrict_permission(): request Err(PermissionRestricted), permission() Denied. simulator_... -> open() an id absent from the scripted list. device_busy_... -> fail_open_with(CameraError::new(ErrorKind::DeviceBusy)). mic_permission_... -> deny_microphone(), start_recording audio:true -> MicPermissionDenied, audio:false -> starts. orientation_change_... -> set_orientation(LandscapeLeft), orientation() == LandscapeLeft, stop() Ok. orientation_lock_... -> fail_recording_with(OrientationUnsupported) then start_recording with orientation Some(...) -> OrientationUnsupported. backgrounded_interruption_... -> interrupt_recording(), stop Err(Interrupted), cancel -> AlreadyResolved. caller_cancel_... -> cancel() Ok, stop -> AlreadyResolved. second_recording_... -> start twice, second -> InProgress. unsupported_format_... -> fail_capture_with(FormatUnsupported). closed_preview_... -> start_preview, close(), next_frame -> AlreadyResolved. invalid_arguments_... -> open(&CameraId(String::new())) -> InvalidArgument; start_recording with mime Some(\"\") -> InvalidArgument.",
  "tests/fake_backend.rs: the scripted happy path (grant -> with_devices -> open -> capture Ok with the queued photo; stop Ok with the queued data) and every default behavior in the fake contract.",
  "tests/bridges.rs: for each bridge backend (AppleBackend::new(), AndroidBackend::new(), WindowsBackend::new(), LinuxBackend::new()) wrapped in Camera::with_backend: permission() -> Ok(NotDetermined)? NO — every call through an unwired link resolves Err(NotAvailable): permission() Err, request_permission() Err, devices() Err, open() Err; assert err.code() == \"ERR_CAMERA_NOT_AVAILABLE\"; use exactly the four locked function names above.",
].join("\n");

const TS_TESTS_CONTRACT = [
  "packages/nsh-camera/tests/ holds four test files importing { expect, test } from \"nsh/test\" and the API from \"../src\" (the biometrics pattern: tests/auth.test.tsx). They run under `nsh test` in CI; nothing runs locally.",
  "tests/errors.test.tsx: every code string appears in the CameraErrorCode union; cameraError(code).message matches the locked sentence; asCameraError maps unknown throws to ERR_CAMERA_BACKEND and passes a CameraError through.",
  "tests/camera.test.tsx: new Camera() (unsupported default) rejects permission() with ERR_CAMERA_NOT_AVAILABLE; a memoryBackend path: grant -> requestPermission resolves \"granted\"; devices() returns the scripted list; open of an unknown id rejects ERR_CAMERA_NOT_AVAILABLE; open with an empty string rejects ERR_CAMERA_INVALID_ARGUMENT.",
  "tests/device.test.tsx: through memoryBackend — capturePhoto resolves the queued photo; one recording at a time (second startRecording rejects ERR_CAMERA_IN_PROGRESS); stop/cancel exactly-once set; interruption path; preview close path; device close path.",
  "tests/edge-cases.test.tsx: one test per locked name, titles EXACTLY the snake_case names, mirroring the Rust edge tests through memoryBackend.",
].join("\n");

const BRIDGE_CONTRACT = [
  "Each bridge file (crates/nsh-camera/src/platform/apple.rs, android.rs, windows.rs, linux.rs) is self-contained and compiles on every target (NO cfg gates on the module — GitHub's ubuntu CI must check it). All items pub, in this order:",
  "1. The link trait: the native calls this platform will make once a native backend lands. Apple: AvFoundationLink; Android: CameraXLink; Windows and Linux: NokhwaLink. All methods &self (interior state in the impls). Same shape for every bridge:",
  "     fn permission_probe(&self) -> LinkPermission;",
  "     fn request_permission(&self) -> LinkPermission;",
  "     fn mic_permission_probe(&self) -> LinkPermission;   // consulted when a recording asks for audio",
  "     fn device_list(&self) -> Result<Vec<CameraInfo>, LinkFailure>;",
  "     fn open_device(&self, id: &CameraId) -> Result<(), LinkFailure>;",
  "     fn capture_photo(&self, options: &PhotoOptions) -> Result<Photo, LinkFailure>;",
  "     fn start_preview(&self) -> Result<(), LinkFailure>;",
  "     fn next_frame(&self) -> Result<Frame, LinkFailure>;",
  "     fn start_recording(&self, options: &RecordingOptions) -> Result<(), LinkFailure>;",
  "     fn recording_orientation(&self) -> Orientation;",
  "     fn stop_recording(&self) -> Result<Recording, LinkFailure>;",
  "     fn cancel_recording(&self) -> Result<(), LinkFailure>;",
  "     fn close_device(&self) -> Result<(), LinkFailure>;",
  "   with pub enums (derive Debug, Clone, Copy, PartialEq, Eq, Hash):",
  "     enum LinkPermission { Granted, DeclinedOnce, DeclinedPermanently, Restricted, Unavailable }",
  "     enum LinkFailure { Busy, Missing, AudioPermission, Format, Orientation, Interrupted, Unavailable }",
  "2. struct NullLink implementing the link trait: every method resolves Unavailable / Err(LinkFailure::Unavailable) / LinkPermission::Unavailable.",
  "3. struct ScriptedLink implementing the link trait: Arc<Mutex<ScriptedState>> with pub setters, one per method (set_permission_probe, set_request_permission, set_mic_permission, set_device_list, fail_device_list, set_open_device, fail_open_device, set_capture_photo, fail_capture_photo, fail_start_preview, set_next_frame, fail_next_frame, fail_start_recording, set_recording_orientation, set_stop_recording, fail_stop_recording, set_cancel_recording ok); unset values resolve Unavailable. No native calls.",
  "4. struct BridgeName<L: LinkTrait> (AppleBackend, AndroidBackend, WindowsBackend, LinuxCamera's LinuxBackend — see names below) holding Arc<L>, with pub fn new() -> <Self><NullLink>, pub fn with_link(link: Arc<L>) -> Self, and a Default impl for <Self><NullLink> (clippy new_without_default). It implements Backend.",
  "5. The device, preview, and recording structs (for example AppleDevice, ApplePreview, AppleRecording) implementing DeviceBackend, PreviewBackend, RecordingBackend, produced by the backend. Every link result maps EXACTLY per this table:",
  "     LinkPermission: permission() Granted -> Ok(Granted); DeclinedOnce | DeclinedPermanently | Restricted -> Ok(PermissionState::Denied); Unavailable -> Err(NotAvailable)",
  "     request_permission(): Granted -> Ok(Granted); DeclinedOnce -> Err(PermissionDenied); DeclinedPermanently -> Err(PermissionPermanentlyDenied); Restricted -> Err(PermissionRestricted); Unavailable -> Err(NotAvailable)",
  "     mic: a recording with audio true consults mic_permission_probe: DeclinedOnce | DeclinedPermanently | Restricted -> Err(MicPermissionDenied); Unavailable -> Err(NotAvailable); Granted -> proceeds",
  "     device_list(): Ok(list) -> Ok(list); Busy -> Err(DeviceBusy); Missing | Unavailable -> Err(NotAvailable)",
  "     open_device(): Ok(()) -> Ok(device); Busy -> Err(DeviceBusy); Missing | Unavailable -> Err(NotAvailable)",
  "     capture_photo(): Ok(photo) -> Ok(photo); Format -> Err(FormatUnsupported); Busy -> Err(DeviceBusy); Missing | Unavailable -> Err(NotAvailable)",
  "     next_frame(): Ok(frame) -> Ok(frame); Missing | Unavailable -> Err(NotAvailable)",
  "     start_preview(): Ok(()) -> Ok(preview); Missing | Unavailable -> Err(NotAvailable)",
  "     start_recording(): Ok(()) -> Ok(recording); AudioPermission -> Err(MicPermissionDenied); Format -> Err(FormatUnsupported); Orientation -> Err(OrientationUnsupported); Busy -> Err(DeviceBusy); Missing | Unavailable -> Err(NotAvailable)",
  "     stop_recording(): Ok(recording) -> Ok(recording); Interrupted -> Err(Interrupted); Unavailable -> Err(NotAvailable)",
  "     cancel_recording(): Ok(()) -> Ok(()); Unavailable -> Err(NotAvailable)",
  "     close_device(): Ok(()) -> Ok(()); Busy -> Err(DeviceBusy); Missing | Unavailable -> Err(NotAvailable)",
  "   Struct names: apple.rs -> AppleBackend/AppleDevice/ApplePreview/AppleRecording; android.rs -> AndroidBackend/AndroidDevice/AndroidPreview/AndroidRecording; windows.rs -> WindowsBackend/WindowsDevice/WindowsPreview/WindowsRecording; linux.rs -> LinuxBackend/LinuxDevice/LinuxPreview/LinuxRecording.",
  "6. #[cfg(test)] mod tests covering at least: NullLink resolves Err(NotAvailable) on Camera::with_backend(<Bridge>::new()) for permission(), request_permission(), devices(), open(); scripted permission probes Granted / DeclinedOnce / DeclinedPermanently / Restricted map per the table; mic audio path maps AudioPermission -> MicPermissionDenied; device_list Busy / Missing map per the table; scripted open then capture Format -> FormatUnsupported; scripted start_recording Orientation -> OrientationUnsupported; scripted stop Interrupted -> Interrupted; an InvalidArgument never reaches the link (empty id / empty mime refused by the high level). Tests may use expect/assert.",
  "Platform notes for the module doc comment (1-2 lines each):",
  "  apple.rs: AVFoundation via a future objc2 or Swift bridge (docs/brief.md). On the iOS simulator AVFoundation lists no cameras, which is why Missing maps to NotAvailable. iOS asks for camera permission exactly once; DeclinedPermanently means only Settings can change it. Restricted is the parental-controls state.",
  "  android.rs: CameraX through a future JNI link (docs/brief.md). A camera held by another app maps to Busy (ERR_CAMERA_DEVICE_BUSY). Lifecycle interruptions when the app is backgrounded surface as Interrupted at stop.",
  "  windows.rs: nokhwa on desktop (docs/brief.md), Media Foundation backend. Windows has a per-app camera privacy gate (Settings, Privacy, Camera), which is why the link carries permission probes even on desktop. Desktop webcams cannot re-orient a recording: Orientation.",
  "  linux.rs: nokhwa on desktop (docs/brief.md), V4L2 backend. Linux has no OS camera permission gate: a real link reports Granted always, but the bridge keeps the same probe mapping as the other desktop bridge. Desktop webcams cannot re-orient a recording: Orientation.",
].join("\n");

const CORE_FILES_CONTRACT = [
  "crates/nsh-camera/src/lib.rs: a 2-4 line crate doc (what the crate is; native link layers are not wired this release — every bridge through a NullLink resolves ERR_CAMERA_NOT_AVAILABLE; see docs/parity.md). Then, in this order:",
  "  mod backend; mod camera; mod device; mod error; mod fake; mod options; mod platform;",
  "  pub use backend::{Backend, DeviceBackend, PreviewBackend, RecordingBackend};",
  "  pub use camera::Camera;",
  "  pub use device::{CameraDevice, PreviewStream, RecordingSession};",
  "  pub use error::{CameraError, ErrorKind};",
  "  pub use fake::FakeBackend;",
  "  pub use options::{CameraId, CameraInfo, CameraPosition, Frame, Orientation, PermissionState, Photo, PhotoOptions, Recording, RecordingOptions, Resolution};",
  "  pub use platform::{AndroidBackend, AppleBackend, LinuxBackend, UnsupportedBackend, WindowsBackend};",
  "crates/nsh-camera/src/platform/mod.rs: pub mod android; pub mod apple; pub mod linux; pub mod unsupported; pub mod windows;",
  "crates/nsh-camera/src/platform/unsupported.rs: pub struct UnsupportedBackend implementing Backend — permission() -> Ok(PermissionState::NotDetermined); request_permission(), devices(), open_device() -> Err(CameraError::new(ErrorKind::NotAvailable)) — with a 1-2 line comment: the default until a native backend is wired; an unwired camera is an unavailable camera.",
  "crates/nsh-camera/src/camera.rs: the Camera struct over Arc<dyn Backend> (with_backend stores the Arc; new() uses Arc::new(UnsupportedBackend::default())), with pass-through permission/request_permission/devices and open() adding the invalid-argument guard (empty id -> ERR_CAMERA_INVALID_ARGUMENT before the backend is touched).",
  "crates/nsh-camera/src/device.rs: CameraDevice, PreviewStream, RecordingSession over Arc<Mutex<...>> state carrying closed / recording_active / resolved flags, enforcing the semantics contract (InProgress on a second recording; AlreadyResolved everywhere it applies; InvalidArgument guards for empty mime, fps Some(0)).",
  "crates/nsh-camera/Cargo.toml: [package] name = \"nsh-camera\", description = \"Photo capture, video recording and live preview for Native Shell apps\", and version/edition/license/repository/authors inherited via workspace = true (the biometrics pattern), plus [lib] name = \"nsh_camera\", path = \"src/lib.rs\". NO [dependencies] section: the crate stays std-only this release.",
  "Root Cargo.toml becomes the workspace manifest, exactly the biometrics shape:",
  "  [workspace]",
  "  members = [\"crates/nsh-camera\"]",
  "  resolver = \"3\"",
  "  [workspace.package]",
  "  version = \"0.1.0\"",
  "  edition = \"2024\"",
  "  license = \"MIT\"",
  "  repository = \"https://github.com/SuperNSH/camera\"",
  "  authors = [\"hmziqrs\"]",
  "Delete the old root src/ directory (src/lib.rs scaffold) and the old root tests/ directory entirely — the crate moved under crates/. Do it with file deletions, never with a git command.",
].join("\n");

const TS_FILES_CONTRACT = [
  "packages/nsh-camera mirrors crates/nsh-camera module-for-module (the biometrics pattern: auth.ts mirrors auth.rs, errors.ts mirrors error.rs, memory.ts mirrors fake.rs):",
  "  src/index.ts: re-export the public surface — Camera from ./camera; CameraDevice, PreviewStream, RecordingSession from ./device; CameraBackend and the three backend interfaces from ./backend; CameraError, asCameraError, cameraError, CameraErrorCode from ./errors; memoryBackend, MemoryCamera, MemoryDevice from ./memory; every options type from ./options.",
  "  src/errors.ts, src/options.ts, src/backend.ts, src/camera.ts, src/device.ts, src/memory.ts: exactly the locked contracts above.",
  "  App.tsx: a minimal NSH app like biometrics' — imports { mount, signal, Text, View } from \"nsh\" and the API from \"./src\"; shows a few lines of status text driven by memoryBackend (a scripted demo, clearly commented that no native link is wired). No camera hardware calls.",
  "  nsh.json: { \"name\": \"nsh-camera tests\", \"id\": \"dev.supernsh.camera.tests\", \"version\": \"0.1.0\", \"build\": 1, \"capabilities\": {} } — NO \"rust\" field: the crate exposes no native module this release (the binding is pinned in docs/decisions.md, not wired).",
  "  tsconfig.json: exactly biometrics' shape — { \"extends\": \"./.nsh/tsconfig.json\", \"include\": [\"App.tsx\", \"src/**/*.ts\", \"tests/**/*.ts\", \"tests/**/*.tsx\"] }. The .nsh file is generated by `nsh check` in CI; do not invent it locally.",
  "  package.json: exactly biometrics' shape — name \"nsh-camera\", version \"0.1.0\", description \"Photo capture, video recording and live preview for Native Shell TSX apps\", license MIT, type module, main and types \"./src/index.ts\", exports { \".\": \"./src/index.ts\", \"./memory\": \"./src/memory.ts\" }, files [\"src\"], repository https://github.com/SuperNSH/camera. NO scripts, NO devDependencies: `nsh check`, `nsh build`, and `nsh test` run everything in CI.",
  "TS style per the biometrics sources: 2-space indent, double quotes, semicolons, Promise-based methods that reject with cameraError(code), JSDoc one-liners on every export. There is no TS formatter gate anywhere in the org's CI, so match the exemplar's style by reading it.",
].join("\n");

const CI_CONTRACT = [
  "Rewrite .github/workflows/ci.yml following the org exemplar .refs/biometrics/.github/workflows/ci.yml, adapted to this repo (one std-only crate, one TS package, no platform dependencies, no demo/publish jobs — the status page keeps its own pages.yml, untouched). Keep the existing header comment style and the concurrency/permissions/env blocks. Jobs:",
  "1. format: ubuntu-latest; checkout (the pinned SHA already in the file); dtolnay/rust-toolchain (the pinned SHA) with stable + rustfmt component; run: cargo fmt --all -- --check.",
  "2. rust: ubuntu-latest; toolchain with clippy component; run: cargo clippy -p nsh-camera --all-targets -- -D warnings ; then run: cargo test -p nsh-camera --no-fail-fast. A 1-2 line comment says why there is no OS matrix and no cross-check job this release: the crate is std-only with no platform dependencies, so ubuntu compiles the same code every target would.",
  "3. typescript: ubuntu-latest; the biometrics NSH install block verbatim (Install NSH, NSH_VERSION: v0.4.0, the curl installer for runner.os != Windows and the pwsh branch may be dropped since this job runs only on ubuntu — keep the ubuntu branch); then, working-directory packages/nsh-camera, one run step: nsh check ; nsh build 2>&1 | tee build.log ; ! grep -i warn build.log ; nsh test — as separate run steps like biometrics does (check; build with tee; the ! grep; test).",
  "Keep timeout-minutes on every job (30-45), the concurrency group, permissions contents: read, and CARGO_TERM_COLOR/CARGO_INCREMENTAL env. Every claim in this file must match what the README's Checks section will say.",
].join("\n");

const PARITY_RULES = [
  "docs/parity.md format, following .refs/biometrics/docs/parity.md closely:",
  "- Title: # Parity with the Flutter camera plugin and react-native-vision-camera.",
  "- Intro paragraph: each row names one public API of Flutter's camera plugin (read in .refs/flutter-packages/packages/camera on 2026-11-09) or of react-native-vision-camera (read in .refs/react-native-vision-camera, package packages/react-native-vision-camera, on 2026-11-09), what nsh-camera does for it, and the test that covers it. expo-camera is reference-only per docs/brief.md and is not enumerated.",
  "- Honesty banner (verbatim in spirit): no row counts as verified until GitHub Actions runs a test for it (AGENTS.md). Statuses describe the written behavior; this table was written before this work's first CI run.",
  "- Status words, the biometrics set plus one: **Done** (written and covered by a test on both sides), **Partial** (written, with the limit named), **Accepted** (the name is accepted for shape and passed on, but nothing uses it), **Platform only** (the effect needs a device; the test checks what the library passes on), **Not covered** (a non-goal; the reason is in the row).",
  "- Columns: | reference API | Rust | TypeScript | Status | Covered by |. Rust names point at crates/nsh-camera; TS names at packages/nsh-camera; test names at crates/nsh-camera/tests/ and packages/nsh-camera/tests/.",
  "- Group rows under headings per reference area (the checklists below). EVERY item on the checklists gets a row; walk the actual sources in .refs/ to confirm names and catch items the checklist's wording summarizes, and add any public item you find that the checklist missed (the whole-tree audit re-greps the export lists).",
].join("\n");

const COVERED_MAP = [
  "The locked mapping for the covered core (use exactly these rows' wording as the anchor; every other checklist item maps to Not covered with a reason, or Accepted where we keep the name for shape):",
  "  availableCameras() -> Camera::devices() / Camera.devices() — Done-written — covered by the fake_backend and camera tests both sides.",
  "  CameraDescription + CameraLensDirection front/back/external -> CameraInfo + CameraPosition — Done-written.",
  "  CameraController(description) + initialize() -> Camera::open(id) — Partial: one call, no separate initialize; permission must be granted first.",
  "  takePicture() -> CameraDevice::capture_photo(PhotoOptions) — Done-written — Photo bytes replace XFile (in-memory data; file IO is the app's job).",
  "  startVideoRecording()/stopVideoRecording() -> CameraDevice::start_recording(RecordingOptions)/RecordingSession::stop() — Done-written — bytes in memory, not a file.",
  "  pauseVideoRecording()/resumeVideoRecording() (Flutter) and pauseRecording()/resumeRecording() (RN Recorder) -> Not covered: non-goal this release; a paused recording needs timer semantics the seam does not model yet.",
  "  RN Recorder.cancelRecording() and our cancel -> RecordingSession::cancel() — Done-written — resolves the call as cancelled.",
  "  RN RecordingFinishedReason stopped/max-duration-reached/max-file-size-reached -> stop() resolves Ok with the data for a normal stop; max-duration and max-file-size auto-stops are Not covered (non-goal).",
  "  prepareForVideoRecording() -> Not covered: non-goal; audio setup happens inside start_recording(audio: true).",
  "  CameraPreview widget / buildPreview() / RN <Camera> view / PreviewView -> Not covered: UI is the NSX app's job; the library exposes frames only.",
  "  pausePreview()/resumePreview() -> Not covered: non-goal this release.",
  "  startImageStream/onLatestImageAvailable/CameraImage planes/ImageFormatGroup -> Partial: PreviewStream::next_frame delivers whole frames; YUV plane access is a non-goal.",
  "  RN usePreviewOutput/useFrameOutput/usePhotoOutput/useVideoOutput/useDepthOutput/useObjectOutput -> Partial for preview/frame (PreviewStream), Not covered for depth/object outputs.",
  "  lockCaptureOrientation()/unlockCaptureOrientation() -> RecordingOptions.orientation — Done-written: honored, or ERR_CAMERA_ORIENTATION_UNSUPPORTED where the platform cannot (desktop).",
  "  DeviceOrientationChangedEvent + RN useOrientation -> RecordingSession::orientation() and Frame.orientation — Done-written.",
  "  CameraClosingEvent/CameraErrorEvent, RN interruption and lifecycle handling -> recording resolves ERR_CAMERA_INTERRUPTED at the next stop — Done-written (fake and scripted-link tests).",
  "  enableAudio (MediaSettings) + RN audio -> RecordingOptions.audio with the microphone check — Done-written — ERR_CAMERA_MIC_PERMISSION_DENIED when declined; bitrate fields Not covered.",
  "  PermissionStatus not-determined/authorized/denied/restricted + usePermission + Flutter permission flows -> PermissionState (three states) + requestPermission() with ERR_CAMERA_PERMISSION_RESTRICTED for restricted — Partial: no reactive hook; plain calls only. RN hasPermission/canRequestPermission map to permission() == Granted and requesting from NotDetermined.",
  "  RN useCameraDevice/useCameraDevices/getAllCameraDevices/getDefaultCameraDevice -> Camera::devices() — Done-written; the devices-changed listener is Not covered (non-goal).",
  "  ResolutionPreset low..max -> PhotoOptions.resolution/RecordingOptions.resolution — Partial: explicit resolutions, no preset names.",
  "  MediaSettings fps -> RecordingOptions.fps — Done-written; videoBitrate/audioBitrate Not covered.",
  "  CameraException + RN CameraErrorCode -> CameraError + CameraErrorCode (ERR_CAMERA_*) — Done-written — the mapping table lives in docs/goals.md.",
  "  Everything else on the checklists (flash/torch, exposure mode/point/offset, focus mode/point, zoom, stabilization, ZSL, JPEG quality, white balance, metering, gestures, frame processors/worklets/threading, barcode/depth/skia/location/resizer packages, VideoCodec/DynamicRange/MirrorMode/TorchMode/QualityPrioritization, extensions, low-light boost, swunky preview scaling) -> Not covered with a one-line non-goal reason each; a handful of pure type aliases (Point, Size, Range) may be Accepted only if a covered row needs them, otherwise Not covered.",
].join("\n");

const FLUTTER_CHECKLIST = [
  "FLUTTER CHECKLIST — one row per item, walking .refs/flutter-packages/packages/camera (camera/lib exports camera.dart, src/camera_controller.dart, src/camera_image.dart, src/camera_preview.dart; camera_platform_interface/lib exports camera_platform_interface.dart, src/platform_interface/camera_platform.dart, src/types/*, src/events/*; the federated subpackages camera_android, camera_android_camerax, camera_avfoundation, camera_web, camera_windows implement the same platform interface — note per-platform behavior only where the interface docs name it):",
  "  availableCameras(); CameraController (debugCheckIsDisposed, initialize, prepareForVideoRecording, pausePreview, resumePreview, setDescription, takePicture, startImageStream, stopImageStream, startVideoRecording, stopVideoRecording, pauseVideoRecording, resumeVideoRecording, buildPreview, getMaxZoomLevel, getMinZoomLevel, setZoomLevel, setVideoStabilizationMode, getSupportedVideoStabilizationModes, isZeroShutterLagSupported, setZeroShutterLagEnabled, setFlashMode, setExposureMode, setExposurePoint, getMinExposureOffset, getMaxExposureOffset, getExposureOffsetStepSize, setExposureOffset, lockCaptureOrientation, unlockCaptureOrientation, setFocusMode, setFocusPoint, setJpegImageQuality, supportsImageStreaming, dispose); CameraValue; Optional; CameraImage + Plane + ImageFormat; CameraPreview widget; onLatestImageAvailable typedef.",
  "  CameraPlatform interface methods (the abstract list: availableCameras, createCamera, createCameraWithSettings, initializeCamera, onCameraInitialized, onCameraResolutionChanged, onCameraClosing, onCameraError, onVideoRecordedEvent, onDeviceOrientationChanged, lockCaptureOrientation, unlockCaptureOrientation, takePicture, prepareForVideoRecording, startVideoRecording, startVideoCapturing, stopVideoRecording, pauseVideoRecording, resumeVideoRecording, supportsImageStreaming, onStreamedFrameAvailable, setFlashMode, setExposureMode, setExposurePoint, getMinExposureOffset, getMaxExposureOffset, getExposureOffsetStepSize, setExposureOffset, setFocusMode, setFocusPoint, getMaxZoomLevel, getMinZoomLevel, setZoomLevel, getSupportedVideoStabilizationModes, setVideoStabilizationMode, pausePreview, resumePreview, setDescriptionWhileRecording, buildPreview, dispose).",
  "  Types: CameraDescription, CameraLensDirection (front/back/external), CameraLensType (wide/telephoto/ultraWide/unknown), CameraException (code + description), ResolutionPreset (low/medium/high/veryHigh/ultraHigh/max), FlashMode (off/auto/always/torch), ExposureMode (auto/locked), FocusMode (auto/locked), ImageFormatGroup (unknown/jpeg/yuv420/nv21/bgra8888), ImageFileFormat (jpeg/heif), VideoStabilizationMode, MediaSettings (resolutionPreset/fps/videoBitrate/audioBitrate/enableAudio), VideoCaptureOptions (cameraId/streamCallback/streamOptions/maxDuration/enablePersistentRecording/videoOutputPath), XFile.",
  "  Events: CameraInitializedEvent, CameraResolutionChangedEvent, CameraClosingEvent, CameraErrorEvent, VideoRecordedEvent, DeviceOrientationChangedEvent.",
  "  The subpackages' one-sentence role rows: camera_android (classic Camera2 via method channel), camera_android_camerax (CameraX — the brief's recommended Android path), camera_avfoundation (iOS/macOS AVFoundation), camera_web (getUserMedia; its failure modes: NotAllowedError, NotFoundError, NotReadableError, OverconstrainedError), camera_windows (Media Foundation) — each maps to our bridge plan or Not covered (web).",
].join("\n");

const RN_CHECKLIST = [
  "REACT NATIVE CHECKLIST — one row per item, walking .refs/react-native-vision-camera/packages/react-native-vision-camera/src (index.ts re-exports these modules; read each for its public items):",
  "  Devices API: CameraDevices.ts (getAllCameraDevices, getDefaultCameraDevice, addOnCameraDevicesChangedListener, getSupportedExtensions), devices/getCameraDevice.",
  "  Hooks: useAsyncRunner, useCamera, useCameraDevice, useCameraDeviceExtensions, useCameraDevices, useDepthOutput, useFrameOutput, useFrameRenderer, useObjectOutput, useOrientation, usePermission (+ PermissionStatus not-determined/authorized/denied/restricted, hasPermission, canRequestPermission), usePhotoOutput, usePreviewOutput, useVideoOutput.",
  "  VisionCamera factory (createDeviceFactory), views/Camera, views/NativePreviewView, views/NativeFrameRendererView, isScannedObject.",
  "  Specs: CameraController.nitro (configure, focusTo, resetFocus, subject-area listener, setZoom, zoom animations, setTorchMode, enableTorchWithStrength, exposure bias/lock, focus lock, white balance) ; CameraFactory.nitro ; CameraDevice.nitro + CameraExtension ; session (CameraSession, configs, connections, output configuration) ; outputs (CameraOutput, CameraPhotoOutput, CameraVideoOutput, CameraPreviewOutput, CameraFrameOutput, CameraDepthFrameOutput, CameraObjectOutput, Recorder: startRecording/stopRecording/pauseRecording/resumeRecording/cancelRecording + RecordingFinishedReason stopped/max-duration-reached/max-file-size-reached) ; instances (Frame, Photo: pixel buffers, saveToFileAsync, getFileData, toImage; CameraCalibrationData; Depth; ScannedObject) ; OrientationManager ; metering (MeteringPoint) ; gestures (GestureController, TapToFocusGestureController, ZoomGestureController) ; frame processors (NativeThread, NativeThreadFactory, FrameRenderer, FrameConverter) ; threading (AsyncRunner, RuntimeThread, RuntimeThreadProvider).",
  "  Common types: AutoFocusSystem, CameraOrientation, CameraPosition, Constraint, DepthPixelFormat, DeviceType, DynamicRange, ExposureMode, FocusMode, FocusOptions, FrameDroppedReason, ListenerSubscription, MediaType, MirrorMode, NativeBuffer, OrientationSource, OutputStreamType, PermissionStatus, PhotoContainerFormat, PixelFormat, Point, QualityPrioritization, Range, Size, StabilizationMode, TorchMode, VideoCodec, VideoPixelFormat, WhiteBalanceGains, WhiteBalanceMode, WhiteBalanceTemperatureAndTint.",
  "  The sibling packages react-native-vision-camera-barcode-scanner, -location, -resizer, -skia, -worklets: one Not covered row each (separate packages, out of scope).",
].join("\n");

const GOALS_CONTRACT = [
  "docs/goals.md sections, in order (direct, concrete prose; no marketing filler):",
  "1. Goal: photo capture, video recording and live preview for Native Shell apps, as one Rust crate (crates/nsh-camera) and one TypeScript package (packages/nsh-camera) with the same API names and the same behavior, tests in both, laid out like SuperNSH/biometrics.",
  "2. Platform scope: Apple via AVFoundation, Android via CameraX, Windows and Linux via nokhwa — as link-layer seams in crates/nsh-camera/src/platform/. No native backend is wired this release: every unwired link resolves ERR_CAMERA_NOT_AVAILABLE. Web stays out of scope: docs/brief.md names no web camera option (camera_web exists in the Flutter reference, but the brief's recommended path has no web).",
  "3. The exactly-once contract (the semantics, stated with the rules below).",
  "4. The error table: exactly the 14 kinds and codes below, as a markdown table (kind, code, meaning, what maps onto it — include the reference failure modes each code absorbs: getUserMedia NotFoundError/NotReadableError, Android MAX_CAMERAS_IN_USE, iOS restricted, Flutter 'A video recording is already started', AVCaptureSession interruptions, OverconstrainedError, RN deniedForever, and so on).",
  "5. The edge-case table mapping every edge case below to its named test on both sides (Rust fn in crates/nsh-camera/tests/edge_cases.rs, TS title in packages/nsh-camera/tests/edge-cases.test.tsx).",
  "6. Acceptance criteria, each mapped to where it is proven: one stable code per failure mode -> tests/error_codes.rs and tests/errors.test.tsx; exactly-once -> tests/exactly_once.rs and tests/device.test.tsx; reference edge cases -> the edge tables; fake/memory scripting -> tests/fake_backend.rs and tests/camera.test.tsx + tests/device.test.tsx; unwired bridges -> tests/bridges.rs; Rust gates + TS typecheck/build/test -> .github/workflows/ci.yml (which never runs on a developer machine).",
  "7. Non-goals, one line each with the reason: torch/flash, zoom, exposure and focus control, white balance, video stabilization, zero-shutter-lag, JPEG quality control, YUV plane access, preview pause/resume, video pause/resume, max-duration and max-file-size auto-stops, persistent recording, file-path output (data is returned in memory), reactive hooks/signals, the <Camera> preview widget, frame processors and worklet threading, barcode/depth/location/skia/resizer, web platform, the native TSX binding (pinned but not wired; see docs/decisions.md).",
  "8. References: the STEP 0 table lives in docs/decisions.md; goals.md links to it.",
].join("\n");

const DECISIONS_CONTRACT = [
  "docs/decisions.md follows the biometrics exemplar: an intro line, then one ## heading per decision, each saying what was chosen, why, and the consequence. Required decisions (write them in this spirit, in your own direct words):",
  "1. Layout mirrors SuperNSH/biometrics: root workspace, crates/nsh-camera, packages/nsh-camera, docs/, examples/ later. The repo was a single root crate; the restructure moved it.",
  "2. The crate is std-only this release: no nsh-core, no nokhwa, no objc2, no JNI. Versions stay unpinned until checked on the registry (docs/brief.md's rule), and a native backend without verified dependencies would be unwritable. Consequence: the platform/ modules are link-layer seams, and every unwired link resolves ERR_CAMERA_NOT_AVAILABLE.",
  "3. The native TSX binding is pinned, not wired: when nsh-core lands, native.rs exposes #[native_module(\"nsh-camera/native\")] with a NativeCamera #[class] following biometrics' plain-value rule, packages' exports gain \"./rust\" returning rustBackend(), and nsh.json gains the \"rust\" field. Deferred because camera's surface crosses device handles and frame bytes, which the plain-value rule does not cover yet — a design decision that needs nsh-core's API in hand.",
  "4. Rust calls are synchronous and non-blocking; TypeScript wraps the same calls in Promises. The semantics (exactly-once, coded errors) are identical both sides; a behavior change lands in both, with a test in both.",
  "5. Error codes follow the org scheme ERR_CAMERA_* (the biometrics pattern), 14 kinds, each absorbing the reference failure modes it covers; Display sentences are mirrored word-for-word in the TS MESSAGES.",
  "6. Permission semantics: iOS asks once, then Settings only; Android's don't-ask-again maps to the permanent code; restricted (parental controls) is its own code; the state reports Denied for both permanent and restricted; the microphone check rides on RecordingOptions.audio.",
  "7. Recording data is returned in memory as bytes; no file paths (Flutter's XFile/videoOutputPath and RN's saveToFile are non-goals). Consequence: long recordings cost memory; the seam keeps the surface testable without a filesystem.",
  "8. One recording per device, like Flutter's already-started guard: the second start resolves ERR_CAMERA_IN_PROGRESS.",
  "9. Web stays out of scope; the Flutter reference's camera_web is enumerated in parity only to say Not covered.",
  "10. Versions: NSH relationship per .refs/nsh (TSX apps import \"nsh\" and \"nsh/test\"; our package follows biometrics' consumption pattern); nokhwa/CameraX/AVFoundation wrappers stay unpinned until checked on the registry; the CI installs NSH v0.4.0 exactly as biometrics does.",
  "11. The STEP 0 reference table (the STEP0 block below, verbatim as a markdown table or list).",
].join("\n");

const STATUS_CONTRACT = [
  "README.md: rewrite the Status section — the repo now builds a Rust crate (crates/nsh-camera) and a TypeScript package (packages/nsh-camera) with the same API and behavior; the layout mirrors SuperNSH/biometrics; no native camera backend is wired yet (every unwired link resolves ERR_CAMERA_NOT_AVAILABLE); nothing here is verified until GitHub Actions runs, and this work is uncommitted. Rewrite Layout: root Cargo.toml workspace, crates/nsh-camera (src modules + tests), packages/nsh-camera (src, tests, App.tsx, nsh.json, tsconfig.json), docs/{brief,goals,decisions,parity}.md, site/, .github/workflows/. Rewrite Checks to name exactly what ci.yml runs: cargo fmt --all -- --check (format job); cargo clippy -p nsh-camera --all-targets -- -D warnings and cargo test -p nsh-camera --no-fail-fast (rust job); nsh check, nsh build (warnings fail), nsh test (typescript job, NSH v0.4.0). Add one line: nothing is built or tested on a developer machine.",
  "site/index.html: update only the status paragraph to match parity.md, e.g. 'Status: Rust and TypeScript camera API written, unverified by CI. No native camera backend is wired yet.' Keep the page's structure and style.",
  "Honesty rules: never claim a passing CI run, a test result, or device support. This work is uncommitted and unverified until GitHub Actions runs on the next push.",
].join("\n");

const PLANNED_TREE = [
  "- Cargo.toml (workspace manifest), crates/nsh-camera/Cargo.toml  (core area)",
  "- crates/nsh-camera/src/{lib,camera,device,error,options,backend,fake}.rs, crates/nsh-camera/src/platform/{mod,unsupported}.rs  (core area)",
  "- crates/nsh-camera/src/platform/{apple,android,windows,linux}.rs  (one bridge area each)",
  "- crates/nsh-camera/tests/{error_codes,exactly_once,edge_cases,fake_backend,bridges}.rs  (rust-tests area)",
  "- packages/nsh-camera/{package.json,tsconfig.json,nsh.json,App.tsx}, packages/nsh-camera/src/{index,errors,options,backend,memory,camera,device}.ts  (ts-package area)",
  "- packages/nsh-camera/tests/{errors,camera,device,edge-cases}.test.tsx  (ts-tests area)",
  "- .github/workflows/ci.yml  (ci area; pages.yml stays untouched)",
  "- docs/goals.md, docs/decisions.md, AGENTS.md (one added line)  (goals area)",
  "- docs/parity.md  (parity area)",
  "- README.md, site/index.html  (status area)",
  "- DELETED: the old root src/ and tests/ directories  (core area deletes them)",
].join("\n");

const HARD_RULES = [
  "Hard rules for this repo (AGENTS.md):",
  "- GitHub Actions compiles and tests everything. NEVER run cargo, rustc, tsc, nsh, npm, or any build/test command; you have no compiler feedback, so be exact: every name, import, signature and brace must be right by construction.",
  "- You MAY run 'rustfmt --edition 2024 <files>' (write or check mode) — formatter only, not a build, Rust files only.",
  "- No git operations at all: no commit, no push, no branch, no worktree, no stash, no reset. Work directly in the current checkout.",
  "- Never touch files outside your owned list, and never touch any other repository (the .refs/ checkouts are read-only reference material).",
  "- Comments are 1-2 lines and state a non-obvious constraint. No attribution lines, no filler.",
  "- Dead code is deleted; no speculative abstractions; docs read like a competent human wrote them.",
  "- In non-test Rust code there must be no unwrap/expect/panic!/todo!/unimplemented!/unreachable! and no blocking waits: every operation resolves exactly once (success, a coded error, or a cancel) and never hangs. Tests may use expect/assert freely.",
].join("\n");

const CONTRACTLINE_NOTE =
  "Your result must also carry contractLine: one sentence copied VERBATIM from your instructions (the specialist contract) that most shaped the work.";

function plainPersona(role: string): string {
  return (
    `You are the ${role} for one area of a parallel workflow in ${REPO}. Work only inside that project.\n\n` +
    HARD_RULES +
    "\n\nIf your instructions contradict each other or a requirement is impossible, say so plainly in your result rather than working around it."
  );
}

async function specialist(name: string, fallback: string): Promise<string> {
  const adapter =
    `You are the ${name} specialist for one area of a parallel workflow in ${REPO}. ` +
    `Your full specialist contract follows verbatim — apply it to this area's work; ` +
    `where it conflicts with your ask, the ask wins.` +
    "\n\n";
  for (const p of [`.zcode/agents/${name}.md`, `${KIT}/${name}.md`]) {
    try {
      const raw = await files.read(p);
      return adapter + raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
    } catch {
      /* try the next source */
    }
  }
  return adapter + fallback;
}

function lineVerified(persona: string, line: string | undefined): boolean {
  return typeof line === "string" && line.trim().length > 0 && persona.includes(line.trim());
}

const CONTRACTLINE_RETRY =
  "Your previous reply was received, but its contractLine did not match your instructions. " +
  "Re-send the same result unchanged and add contractLine: one sentence copied VERBATIM from your instructions that most shaped the work.";

function auditAsk(spec: AreaSpec, gateOut: string): string {
  const rustChecks =
    spec.fmtFiles.length > 0
      ? [
          "Standard checks for Rust files:",
          "- Compile-correctness by reading: every referenced item exists with matching types; imports resolve; match arms are exhaustive; no missing returns; generic and lifetime bounds hold.",
          "- Clippy under -D warnings: flag anything default rustc or clippy could warn on — unused imports or variables (including #[cfg(test)] code, which --all-targets compiles), dead code on non-pub items, needless borrows or clones, redundant struct field names, new() without Default, uninlined format args (prefer inline), ptr_arg, len_zero, single-char patterns, derivable impls.",
          "- Never panic, never hang in non-test code: no unwrap/expect/panic!/todo!/unimplemented!/unreachable!, no sleeps, no unbounded loops, no lock held across a call that could re-lock it. Tests may use expect/assert.",
          gateOut
            ? "- The script's rustfmt --edition 2024 --check gate (formatter only, not a build) reported non-zero for this area's files; every affected file must appear in findings:\n" + gateOut
            : "- The script's rustfmt gate output is not attached; still flag obvious rustfmt deviations.",
          "",
        ]
      : [];
  const parallelNote = [
    "Parallel note: the other areas write their files at the same time. Judge this area against the locked contract blocks in your instructions and the exemplar in .refs/biometrics, NOT against whether other areas' files exist on disk yet.",
    "",
  ];
  return [
    `Audit the files ${spec.files.join(", ")} in ${REPO}. Read each file fully. You are read-only: never edit, create or delete any file; never run cargo, rustc, tsc, nsh, npm, or any build/test command; no git operations.`,
    "",
    spec.auditBrief,
    "",
    ...parallelNote,
    ...rustChecks,
    "Return ONLY actionable findings with file:line pointers. An empty issues array means the area genuinely passed. No PASS notes, no praise, no summaries of what is fine. If you cannot check something, say so inside a finding rather than staying silent.",
    spec.specialist ? CONTRACTLINE_NOTE : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------- areas

const AREAS: AreaSpec[] = [
  {
    name: "goals docs",
    title: "goals and decisions docs",
    specialist: null,
    oneLine: "docs/goals.md + docs/decisions.md + AGENTS.md line: expanded contract, reference edges, STEP 0 record",
    files: ["docs/goals.md", "docs/decisions.md", "AGENTS.md"],
    fmtFiles: [],
    implementAsk: [
      "Implement the goals-and-decisions docs area.",
      "",
      HARD_RULES,
      "",
      "Owned files (create or rewrite; touch nothing else):",
      "- docs/goals.md (rewrite; the old goals-era file is a stub from the previous plan and is superseded)",
      "- docs/decisions.md (rewrite with the decision entries below)",
      "- AGENTS.md (one addition only: insert this bullet right after the 'An operation resolves exactly once' bullet, worded exactly like the biometrics AGENTS.md line: '- Keep the Rust and TypeScript versions' semantics the same. A behavior change lands in both, with a test in both.' Change nothing else in AGENTS.md.)",
      "",
      "Read AGENTS.md, docs/brief.md and .refs/biometrics/docs/{decisions,parity}.md first — the exemplar's docs voice is the target. Write direct, concrete prose.",
      "",
      GOALS_CONTRACT,
      "",
      SEMANTICS_CONTRACT,
      "",
      ERROR_CONTRACT,
      "",
      EDGE_TESTS,
      "",
      DECISIONS_CONTRACT,
      "",
      STEP0_REFS,
      "",
      "When done, return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "docs/goals.md, docs/decisions.md, AGENTS.md. Check: (1) the goals.md error table lists exactly the 14 locked kinds/codes, spelled exactly, and each row names the reference failure modes it absorbs; (2) every edge-case row names a test matching the locked names exactly on both the Rust and TS sides; (3) the exactly-once rules match the locked semantics; (4) scope statements match: no native backend wired, web out of scope, dual Rust/TS surface; (5) acceptance criteria map every criterion to a named test file or a ci.yml job; (6) non-goals cover every item in the locked non-goal list; (7) decisions.md has one section per required decision including the STEP 0 reference table with all six paths; (8) AGENTS.md gained exactly the one biometrics parity bullet and nothing else changed; (9) prose is direct and concrete, no claim of verification.",
  },
  {
    name: "rust core",
    title: "Rust core",
    specialist: "z-rust-engineer",
    oneLine: "workspace restructure + crates/nsh-camera core: codes, types, seam, fake, high-level rules",
    files: [
      "Cargo.toml",
      "crates/nsh-camera/Cargo.toml",
      "crates/nsh-camera/src/lib.rs",
      "crates/nsh-camera/src/camera.rs",
      "crates/nsh-camera/src/device.rs",
      "crates/nsh-camera/src/error.rs",
      "crates/nsh-camera/src/options.rs",
      "crates/nsh-camera/src/backend.rs",
      "crates/nsh-camera/src/fake.rs",
      "crates/nsh-camera/src/platform/mod.rs",
      "crates/nsh-camera/src/platform/unsupported.rs",
      "src/ (delete)",
      "tests/ (delete)",
    ],
    fmtFiles: [
      "crates/nsh-camera/src/lib.rs",
      "crates/nsh-camera/src/camera.rs",
      "crates/nsh-camera/src/device.rs",
      "crates/nsh-camera/src/error.rs",
      "crates/nsh-camera/src/options.rs",
      "crates/nsh-camera/src/backend.rs",
      "crates/nsh-camera/src/fake.rs",
      "crates/nsh-camera/src/platform/mod.rs",
      "crates/nsh-camera/src/platform/unsupported.rs",
    ],
    implementAsk: [
      "Implement the Rust core area: the workspace restructure plus the crate's core modules.",
      "",
      HARD_RULES,
      "",
      "Owned files (create or rewrite; touch nothing else — the four bridge module files belong to other areas running in parallel):",
      "- Cargo.toml (rewrite as the workspace manifest)",
      "- crates/nsh-camera/Cargo.toml (new)",
      "- crates/nsh-camera/src/{lib,camera,device,error,options,backend,fake}.rs (new)",
      "- crates/nsh-camera/src/platform/{mod,unsupported}.rs (new)",
      "- DELETE the old root src/ directory and the old root tests/ directory (file deletions only, no git commands).",
      "",
      "Read AGENTS.md and .refs/biometrics/crates/nsh-biometrics/src/{lib,error,options,backend,fake}.rs first — the module shapes, naming, and doc-comment voice follow that exemplar. The crate stays std-only: no [dependencies] section, no unsafe, no async runtime. Before writing, load the rust-best-practices skill with the Skill tool (error design and clippy chapters).",
      "",
      CORE_FILES_CONTRACT,
      "",
      ERROR_CONTRACT,
      "",
      TYPES_CONTRACT,
      "",
      SEAM_CONTRACT,
      "",
      HIGH_LEVEL_CONTRACT,
      "",
      SEMANTICS_CONTRACT,
      "",
      FAKE_CONTRACT,
      "",
      "Doc comments: 1-2 lines each, stating the non-obvious constraint (why scripting takes &self; why methods never block; why the boxes are 'static). Format every file with rustfmt --edition 2024 (write mode) before finishing. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "Root Cargo.toml, crates/nsh-camera/Cargo.toml, and crates/nsh-camera/src/{lib,camera,device,error,options,backend,fake}.rs + platform/{mod,unsupported}.rs. Check: (1) the workspace manifest matches the locked biometrics shape and the crate manifest inherits it; (2) ErrorKind kinds and code() strings match the locked table exactly, messages match the locked sentences, CameraError carries kind + status with the locked methods; (3) options types match the locked list with the documented defaults; (4) the four seam traits match the locked signatures (&self methods, Send + Sync, 'static boxes) and the high-level types enforce every semantics rule (InProgress, AlreadyResolved set, InvalidArgument guards, NotAvailable for unwired); (5) FakeBackend implements the locked scripting surface with &self methods over Arc<Mutex<FakeState>>; (6) lib.rs declares exactly the seven mods and re-exports exactly the locked names; platform/mod.rs declares the five modules; UnsupportedBackend resolves per the contract; (7) compile-correctness by reading: every referenced item exists, imports resolve, match arms exhaustive, no missing returns, Arc/Mutex usage sound with no lock held across a re-locking call; (8) never panic or block in non-test code; (9) std-only, no unsafe, no new dependencies; (10) the old root src/ and tests/ are deleted.",
  },
  {
    name: "apple bridge",
    title: "Apple bridge",
    specialist: "z-rust-engineer",
    oneLine: "platform/apple.rs: AVFoundation link seam behind Backend with the iOS permission flow",
    files: ["crates/nsh-camera/src/platform/apple.rs"],
    fmtFiles: ["crates/nsh-camera/src/platform/apple.rs"],
    implementAsk: [
      "Implement the Apple bridge area.",
      "",
      HARD_RULES,
      "",
      "Owned file (create; touch nothing else — src/lib.rs, the platform/mod.rs, and the other bridge files belong to other areas running in parallel):",
      "- crates/nsh-camera/src/platform/apple.rs",
      "",
      "Read AGENTS.md and docs/brief.md first. The crate stays std-only: no dependencies, no unsafe, and NO cfg gate on the module. Before writing, load the rust-best-practices skill with the Skill tool (error design and clippy chapters).",
      "",
      BRIDGE_CONTRACT,
      "",
      ERROR_CONTRACT,
      "",
      TYPES_CONTRACT,
      "",
      SEAM_CONTRACT,
      "",
      SEMANTICS_CONTRACT,
      "",
      "Format with rustfmt --edition 2024 (write mode) before finishing. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "crates/nsh-camera/src/platform/apple.rs. Check: (1) AvFoundationLink, LinkPermission, LinkFailure, NullLink, ScriptedLink, AppleBackend/AppleDevice/ApplePreview/AppleRecording with new/with_link/Default present with the locked shapes; (2) every link result maps exactly per the locked mapping table — no variant mapped to the wrong code, match arms exhaustive; (3) the mic probe rides only on audio: true recordings; (4) no method blocks, sleeps, panics, or unwraps in non-test code; (5) in-file #[cfg(test)] tests cover the locked list and would compile (items exist, traits in scope); (6) compile-correctness by reading: imports resolve via crate::{...}, Arc interior state has no lock held across a re-locking call; (7) no dependency, no unsafe, no cfg gate removing the module from compilation.",
  },
  {
    name: "android bridge",
    title: "Android bridge",
    specialist: "z-rust-engineer",
    oneLine: "platform/android.rs: CameraX link seam behind Backend with busy/interruption semantics",
    files: ["crates/nsh-camera/src/platform/android.rs"],
    fmtFiles: ["crates/nsh-camera/src/platform/android.rs"],
    implementAsk: [
      "Implement the Android bridge area.",
      "",
      HARD_RULES,
      "",
      "Owned file (create; touch nothing else — src/lib.rs, platform/mod.rs, and the other bridge files belong to other areas running in parallel):",
      "- crates/nsh-camera/src/platform/android.rs",
      "",
      "Read AGENTS.md and docs/brief.md first. The crate stays std-only: no dependencies, no unsafe, and NO cfg gate on the module. Before writing, load the rust-best-practices skill with the Skill tool (error design and clippy chapters).",
      "",
      BRIDGE_CONTRACT,
      "",
      ERROR_CONTRACT,
      "",
      TYPES_CONTRACT,
      "",
      SEAM_CONTRACT,
      "",
      SEMANTICS_CONTRACT,
      "",
      "Format with rustfmt --edition 2024 (write mode) before finishing. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "crates/nsh-camera/src/platform/android.rs. Check: (1) CameraXLink, LinkPermission, LinkFailure, NullLink, ScriptedLink, AndroidBackend/AndroidDevice/AndroidPreview/AndroidRecording with new/with_link/Default present with the locked shapes; (2) every link result maps exactly per the locked mapping table — no variant mapped to the wrong code, match arms exhaustive; (3) the mic probe rides only on audio: true recordings; (4) no method blocks, sleeps, panics, or unwraps in non-test code; (5) in-file #[cfg(test)] tests cover the locked list and would compile (items exist, traits in scope); (6) compile-correctness by reading: imports resolve via crate::{...}, Arc interior state has no lock held across a re-locking call; (7) no dependency, no unsafe, no cfg gate removing the module from compilation.",
  },
  {
    name: "windows bridge",
    title: "Windows bridge",
    specialist: "z-rust-engineer",
    oneLine: "platform/windows.rs: nokhwa link seam behind Backend, orientation lock unsupported",
    files: ["crates/nsh-camera/src/platform/windows.rs"],
    fmtFiles: ["crates/nsh-camera/src/platform/windows.rs"],
    implementAsk: [
      "Implement the Windows bridge area.",
      "",
      HARD_RULES,
      "",
      "Owned file (create; touch nothing else — src/lib.rs, platform/mod.rs, and the other bridge files belong to other areas running in parallel):",
      "- crates/nsh-camera/src/platform/windows.rs",
      "",
      "Read AGENTS.md and docs/brief.md first. The crate stays std-only: no dependencies, no unsafe, and NO cfg gate on the module. Before writing, load the rust-best-practices skill with the Skill tool (error design and clippy chapters).",
      "",
      BRIDGE_CONTRACT,
      "",
      ERROR_CONTRACT,
      "",
      TYPES_CONTRACT,
      "",
      SEAM_CONTRACT,
      "",
      SEMANTICS_CONTRACT,
      "",
      "Format with rustfmt --edition 2024 (write mode) before finishing. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "crates/nsh-camera/src/platform/windows.rs. Check: (1) NokhwaLink, LinkPermission, LinkFailure, NullLink, ScriptedLink, WindowsBackend/WindowsDevice/WindowsPreview/WindowsRecording with new/with_link/Default present with the locked shapes; (2) every link result maps exactly per the locked mapping table — no variant mapped to the wrong code, match arms exhaustive; (3) the desktop orientation lock maps to OrientationUnsupported; (4) no method blocks, sleeps, panics, or unwraps in non-test code; (5) in-file #[cfg(test)] tests cover the locked list and would compile (items exist, traits in scope); (6) compile-correctness by reading: imports resolve via crate::{...}, Arc interior state has no lock held across a re-locking call; (7) no dependency, no unsafe, no cfg gate removing the module from compilation.",
  },
  {
    name: "linux bridge",
    title: "Linux bridge",
    specialist: "z-rust-engineer",
    oneLine: "platform/linux.rs: nokhwa link seam behind Backend, no OS permission gate",
    files: ["crates/nsh-camera/src/platform/linux.rs"],
    fmtFiles: ["crates/nsh-camera/src/platform/linux.rs"],
    implementAsk: [
      "Implement the Linux bridge area.",
      "",
      HARD_RULES,
      "",
      "Owned file (create; touch nothing else — src/lib.rs, platform/mod.rs, and the other bridge files belong to other areas running in parallel):",
      "- crates/nsh-camera/src/platform/linux.rs",
      "",
      "Read AGENTS.md and docs/brief.md first. The crate stays std-only: no dependencies, no unsafe, and NO cfg gate on the module. Before writing, load the rust-best-practices skill with the Skill tool (error design and clippy chapters).",
      "",
      BRIDGE_CONTRACT,
      "",
      ERROR_CONTRACT,
      "",
      TYPES_CONTRACT,
      "",
      SEAM_CONTRACT,
      "",
      SEMANTICS_CONTRACT,
      "",
      "Format with rustfmt --edition 2024 (write mode) before finishing. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "crates/nsh-camera/src/platform/linux.rs. Check: (1) NokhwaLink, LinkPermission, LinkFailure, NullLink, ScriptedLink, LinuxBackend/LinuxDevice/LinuxPreview/LinuxRecording with new/with_link/Default present with the locked shapes; (2) every link result maps exactly per the locked mapping table — no variant mapped to the wrong code, match arms exhaustive; (3) the desktop orientation lock maps to OrientationUnsupported; (4) no method blocks, sleeps, panics, or unwraps in non-test code; (5) in-file #[cfg(test)] tests cover the locked list and would compile (items exist, traits in scope); (6) compile-correctness by reading: imports resolve via crate::{...}, Arc interior state has no lock held across a re-locking call; (7) no dependency, no unsafe, no cfg gate removing the module from compilation.",
  },
  {
    name: "rust tests",
    title: "Rust tests",
    specialist: "z-rust-engineer",
    oneLine: "crates/nsh-camera/tests/: codes, exactly-once, reference edge cases, fake scripting, bridges",
    files: [
      "crates/nsh-camera/tests/error_codes.rs",
      "crates/nsh-camera/tests/exactly_once.rs",
      "crates/nsh-camera/tests/edge_cases.rs",
      "crates/nsh-camera/tests/fake_backend.rs",
      "crates/nsh-camera/tests/bridges.rs",
    ],
    fmtFiles: [
      "crates/nsh-camera/tests/error_codes.rs",
      "crates/nsh-camera/tests/exactly_once.rs",
      "crates/nsh-camera/tests/edge_cases.rs",
      "crates/nsh-camera/tests/fake_backend.rs",
      "crates/nsh-camera/tests/bridges.rs",
    ],
    implementAsk: [
      "Implement the Rust tests area.",
      "",
      HARD_RULES,
      "",
      "Owned files (create; touch nothing else — src/ belongs to other areas running in parallel; write tests only against the public API):",
      "- crates/nsh-camera/tests/error_codes.rs (new)",
      "- crates/nsh-camera/tests/exactly_once.rs (new)",
      "- crates/nsh-camera/tests/edge_cases.rs (new)",
      "- crates/nsh-camera/tests/fake_backend.rs (new)",
      "- crates/nsh-camera/tests/bridges.rs (new)",
      "",
      "Read AGENTS.md and docs/brief.md first (docs/goals.md may still be landing from a parallel area; its locked content is reproduced below, so do not wait for it). Load the rust-testing skill with the Skill tool before writing.",
      "",
      "Tests import from the crate root: use nsh_camera::{...}. Trait methods need the trait in scope. Public items: Camera, CameraDevice, PreviewStream, RecordingSession, FakeBackend, CameraError, ErrorKind, every options type, and the four bridge backends (AppleBackend, AndroidBackend, WindowsBackend, LinuxBackend — each ::new()).",
      "",
      ERROR_CONTRACT,
      "",
      TYPES_CONTRACT,
      "",
      HIGH_LEVEL_CONTRACT,
      "",
      SEMANTICS_CONTRACT,
      "",
      FAKE_CONTRACT,
      "",
      RUST_TESTS_CONTRACT,
      "",
      EDGE_TESTS,
      "",
      "Every expected-error assertion also asserts the stable code string via err.code(). Tests may use expect/assert. Format every file with rustfmt --edition 2024 (write mode) before finishing. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "crates/nsh-camera/tests/{error_codes,exactly_once,edge_cases,fake_backend,bridges}.rs. Check: (1) the locked edge-case and bridge test function names exist with EXACT spelling; (2) every expected-error assertion checks err.code() against the locked string; (3) tests use only the public API — cross-check every item and scripting-method name against the locked contract blocks in your instructions, not against the src/ files that may still be landing; (4) the exactly-once file covers every locked rule; (5) all 14 codes have a code test; (6) no panic paths, no sleeps, no threads; (7) compile-correctness by reading: method names, enum variant spellings, borrow plausibility (scripting while handles alive works because scripting takes &self), trait imports in scope wherever trait methods are called.",
  },
  {
    name: "ts package",
    title: "TypeScript package",
    specialist: "z-nsh-engineer",
    oneLine: "packages/nsh-camera: TS mirror of the crate — errors, options, backend, memory, camera, device",
    files: [
      "packages/nsh-camera/package.json",
      "packages/nsh-camera/tsconfig.json",
      "packages/nsh-camera/nsh.json",
      "packages/nsh-camera/App.tsx",
      "packages/nsh-camera/src/index.ts",
      "packages/nsh-camera/src/errors.ts",
      "packages/nsh-camera/src/options.ts",
      "packages/nsh-camera/src/backend.ts",
      "packages/nsh-camera/src/memory.ts",
      "packages/nsh-camera/src/camera.ts",
      "packages/nsh-camera/src/device.ts",
    ],
    fmtFiles: [],
    implementAsk: [
      "Implement the TypeScript package area: the TS mirror of the Rust crate.",
      "",
      HARD_RULES,
      "",
      "CONFLICT RESOLUTION FOR YOUR PERSONA: no nsh tooling runs locally and .nsh/types is not generated here. Your contract source is the exemplar: read .refs/biometrics/packages/nsh-biometrics (src/*.ts, tests, App.tsx, nsh.json, tsconfig.json, package.json) and mirror every import and API shape from it. Never run nsh, npm, or tsc; correctness is review-audited here and checked by `nsh check` in CI.",
      "",
      "Owned files (create; touch nothing else — tests/ belongs to another area running in parallel):",
      "- packages/nsh-camera/package.json, tsconfig.json, nsh.json, App.tsx (new)",
      "- packages/nsh-camera/src/{index,errors,options,backend,memory,camera,device}.ts (new)",
      "",
      "Read .refs/biometrics/packages/nsh-biometrics/src/{index,errors,options,backend,memory}.ts first — the voice, JSDoc style, and module split are the target. 2-space indent, double quotes, semicolons.",
      "",
      TS_FILES_CONTRACT,
      "",
      ERROR_CONTRACT,
      "",
      TYPES_CONTRACT,
      "",
      SEAM_CONTRACT,
      "",
      HIGH_LEVEL_CONTRACT,
      "",
      SEMANTICS_CONTRACT,
      "",
      FAKE_CONTRACT,
      "",
      "Every export gets a 1-3 line JSDoc. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "packages/nsh-camera/{package.json,tsconfig.json,nsh.json,App.tsx} and src/{index,errors,options,backend,memory,camera,device}.ts. Check: (1) package.json/tsconfig.json/nsh.json match the locked biometrics-shaped templates exactly (no scripts, no devDependencies, exports . and ./memory, nsh.json without a rust field, tsconfig extending ./.nsh/tsconfig.json); (2) the 14 codes exist as the CameraErrorCode union with the locked message sentences in MESSAGES; asCameraError maps unknown to ERR_CAMERA_BACKEND; (3) the four backend interfaces and the Camera/CameraDevice/PreviewStream/RecordingSession classes match the locked names and signatures promise-based; (4) the TS classes enforce every semantics rule themselves (the gate mirrors the Rust gate): one recording per device, exactly-once stop/cancel, close guards, InvalidArgument guards, NotAvailable for the unsupported default backend; (5) memoryBackend exposes the locked scripting surface and rejects with cameraError(code); (6) index.ts re-exports the whole surface; App.tsx imports from \"nsh\" and \"./src\" like the biometrics App and makes no hardware calls; (7) compile-correctness by reading: imports resolve, no `any` leaks beyond asCameraError's unknown coercion, strict-safe optional handling.",
  },
  {
    name: "ts tests",
    title: "TypeScript tests",
    specialist: "z-nsh-engineer",
    oneLine: "packages/nsh-camera/tests/: codes, camera, device, edge cases through memoryBackend",
    files: [
      "packages/nsh-camera/tests/errors.test.tsx",
      "packages/nsh-camera/tests/camera.test.tsx",
      "packages/nsh-camera/tests/device.test.tsx",
      "packages/nsh-camera/tests/edge-cases.test.tsx",
    ],
    fmtFiles: [],
    implementAsk: [
      "Implement the TypeScript tests area.",
      "",
      HARD_RULES,
      "",
      "CONFLICT RESOLUTION FOR YOUR PERSONA: no nsh tooling runs locally and .nsh/types is not generated here. Your contract source is the exemplar: read .refs/biometrics/packages/nsh-biometrics/tests/*.test.tsx and mirror the import and assertion style exactly (import { expect, test } from \"nsh/test\"; API from \"../src\"; rejects.toMatchObject({ code: ... })). Never run nsh, npm, or tsc.",
      "",
      "Owned files (create; touch nothing else — src/ and the package metadata belong to another area running in parallel):",
      "- packages/nsh-camera/tests/errors.test.tsx (new)",
      "- packages/nsh-camera/tests/camera.test.tsx (new)",
      "- packages/nsh-camera/tests/device.test.tsx (new)",
      "- packages/nsh-camera/tests/edge-cases.test.tsx (new)",
      "",
      TS_TESTS_CONTRACT,
      "",
      ERROR_CONTRACT,
      "",
      TYPES_CONTRACT,
      "",
      HIGH_LEVEL_CONTRACT,
      "",
      SEMANTICS_CONTRACT,
      "",
      FAKE_CONTRACT,
      "",
      EDGE_TESTS,
      "",
      "Every expected-error assertion asserts the stable code string. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "packages/nsh-camera/tests/{errors,camera,device,edge-cases}.test.tsx. Check: (1) the edge-cases file's test titles are EXACTLY the locked snake_case names; (2) imports follow the biometrics exemplar (nsh/test, ../src); (3) every expected-error assertion checks the stable code string; (4) the device tests cover the whole exactly-once set; (5) the errors test covers all 14 codes and the asCameraError coercion; (6) names and scripting methods cross-check against the locked memory contract, not against the src files that may still be landing; (7) no hardware calls, no timeouts, no sleeps — promises resolve through microtasks like the biometrics tests.",
  },
  {
    name: "ci workflow",
    title: "CI workflow",
    specialist: null,
    oneLine: ".github/workflows/ci.yml: Rust gates + NSH-installed TS check/build/test, org style",
    files: [".github/workflows/ci.yml"],
    fmtFiles: [],
    implementAsk: [
      "Implement the CI workflow area.",
      "",
      HARD_RULES,
      "",
      "Owned file (rewrite; touch nothing else — .github/workflows/pages.yml stays untouched):",
      "- .github/workflows/ci.yml",
      "",
      "Read the current .github/workflows/ci.yml and .refs/biometrics/.github/workflows/ci.yml first — the org conventions (job split, NSH install, comment voice) come from the exemplar; the pinned action SHAs already in this repo's ci.yml stay.",
      "",
      CI_CONTRACT,
      "",
      "YAML must be valid and load-bearing: every run step names a command that exists in the layout the other areas are building (crates/nsh-camera, packages/nsh-camera). Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      ".github/workflows/ci.yml. Check: (1) jobs format, rust, typescript exist with the locked commands (cargo fmt --all -- --check; cargo clippy -p nsh-camera --all-targets -- -D warnings; cargo test -p nsh-camera --no-fail-fast; the NSH v0.4.0 install block; nsh check; nsh build with tee and the ! grep -i warn gate; nsh test, working-directory packages/nsh-camera); (2) pinned action SHAs are kept, concurrency/permissions/timeout blocks present; (3) no demo/publish/cross-check jobs and no matrix that assumes platform dependencies; the comment explains why; (4) YAML is valid (indentation, quoting) and nothing references files the planned tree does not create; (5) pages.yml is untouched.",
  },
  {
    name: "parity docs",
    title: "parity docs",
    specialist: null,
    oneLine: "docs/parity.md: every public API of the Flutter and RN references, one row each",
    files: ["docs/parity.md"],
    fmtFiles: [],
    implementAsk: [
      "Implement the parity-docs area.",
      "",
      HARD_RULES,
      "",
      "Owned file (create; touch nothing else):",
      "- docs/parity.md",
      "",
      "Read .refs/biometrics/docs/parity.md first — its row format, status vocabulary, and voice are the target. Then walk the reference sources named in the two checklists below, in .refs/flutter-packages and .refs/react-native-vision-camera (read-only reference material). The other areas are writing the implementation in parallel; judge nothing against their files on disk — write the rows from the locked mapping below and the reference sources.",
      "",
      PARITY_RULES,
      "",
      COVERED_MAP,
      "",
      FLUTTER_CHECKLIST,
      "",
      RN_CHECKLIST,
      "",
      "Cross-check while walking: any public item you find in the reference sources that both checklists missed must still get a row (the whole-tree audit re-greps the export lists against your file). Use the locked test names for the Covered by column (the Rust and TS test names are reproduced in the EDGE_TESTS block below); for rows whose only proof is a unit test in a bridge file or the docs themselves, write 'docs review' or the bridge file name honestly.",
      "",
      EDGE_TESTS,
      "",
      "Markdown tables must be well-formed (one row per API, no unescaped pipes inside cells). Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "docs/parity.md. Check: (1) the intro carries the honesty banner (no row verified until CI runs; written before this work's first CI run) and the status-word legend; (2) every item on the FLUTTER CHECKLIST and RN CHECKLIST (in your instructions) has a row, in the locked column format; (3) every row in the COVERED MAP appears with the locked anchor wording or a clearly equivalent one; (4) every Not covered row carries a reason; (5) status words are only Done/Partial/Accepted/Platform only/Not covered and no Done row lacks a Covered-by test on both sides; (6) the four federated Flutter subpackages and the five RN sibling packages each have their role or Not covered row; (7) tables are well-formed markdown with no unescaped pipes; (8) spot-check three reference APIs by reading their source in .refs/ to confirm the row's name and behavior summary are accurate.",
  },
  {
    name: "status docs",
    title: "status docs",
    specialist: null,
    oneLine: "README.md + site/index.html match exactly what is done and what CI runs",
    files: ["README.md", "site/index.html"],
    fmtFiles: [],
    implementAsk: [
      "Implement the status-docs area.",
      "",
      HARD_RULES,
      "",
      "Owned files (rewrite; touch nothing else):",
      "- README.md",
      "- site/index.html",
      "",
      "Read AGENTS.md, docs/brief.md, README.md and site/index.html first. Docs read like a competent human wrote them: direct, concrete, no marketing filler. Twelve areas are writing the tree in parallel right now; the planned tree is:",
      "",
      PLANNED_TREE,
      "",
      "Write claims about that planned tree against the list above; the final whole-tree audit reconciles any drift. Required content:",
      "",
      STATUS_CONTRACT,
      "",
      "These are markdown/HTML files; do not run rustfmt on them. Return {done, summary, blockers}.",
    ].join("\n"),
    auditBrief:
      "README.md and site/index.html. The other areas are still writing their files; judge every claim against the planned tree list in your instructions, NOT against whether the files exist on disk yet. Check: (1) no claim contradicts the planned tree or the honesty rules — no 'CI passes', no 'tested', no 'works on device'; (2) README Status says: dual Rust + TS surface, biometrics layout, no native backend wired (unwired links resolve ERR_CAMERA_NOT_AVAILABLE), uncommitted and unverified until GitHub Actions runs; (3) README Layout lists the planned tree exactly; (4) README Checks names exactly the ci.yml commands in the CI contract in your instructions (fmt; clippy -p nsh-camera; test -p nsh-camera; nsh check; nsh build with warnings fatal; nsh test; NSH v0.4.0) and says nothing runs on a developer machine; (5) site/index.html status line matches; (6) prose is direct and concrete, keeping each file's voice.",
  },
];

// ---------------------------------------------------------------- per-area chain

async function runArea(spec: AreaSpec): Promise<AreaResult> {
  try {
    report({ name: spec.name, phase: "implementing", summary: spec.oneLine }, "areas");
    log(`${spec.name}: implementing (${spec.files.length} file(s))`);

    const fallbackPersona = plainPersona(`careful, strict engineer for the ${spec.title} area`);
    let persona = fallbackPersona;
    if (spec.specialist) {
      persona = await specialist(spec.specialist, fallbackPersona);
    }

    const impl = agent(`Implementer · ${spec.title}`, { system: persona, model: MODELS.pro });
    const auditor = agent(`Auditor · ${spec.title}`, { system: persona, model: MODELS.pro });

    let implRetriedLine = false;
    let auditRetriedLine = false;
    let implLineOk: boolean | null = null;
    let auditLineOk: boolean | null = null;

    const firstAsk = spec.specialist ? `${spec.implementAsk}\n\n${CONTRACTLINE_NOTE}` : spec.implementAsk;
    let made = await impl.ask<ImplResult>(firstAsk);
    if (spec.specialist !== null) {
      implLineOk = lineVerified(persona, made.contractLine);
      if (!implLineOk && !implRetriedLine) {
        implRetriedLine = true;
        const firstMade = made;
        made = await impl.ask<ImplResult>(CONTRACTLINE_RETRY);
        // an empty re-answer must not erase the substantive first one
        if (!made.summary) made = firstMade;
        implLineOk = lineVerified(persona, made.contractLine) || lineVerified(persona, firstMade.contractLine);
      }
    }

    let status: AreaResult["status"] = "done";
    let rounds = 0;
    let remaining: string[] = [];
    let converged = false;

    for (const r of [1, 2, 3]) {
      rounds = r;
      report({ name: spec.name, phase: "auditing", summary: `audit round ${r}` }, "areas");

      let gateOut = "";
      if (spec.fmtFiles.length > 0) {
        try {
          const gate = await world.run("rustfmt", ["--edition", "2024", "--check", ...spec.fmtFiles], {
            timeoutMs: 60000,
          });
          if (gate.exitCode !== 0) gateOut = `${gate.stdout}\n${gate.stderr}`.trim();
        } catch (err) {
          gateOut = `rustfmt gate could not run: ${String(err)}`;
        }
      }

      let audit = await auditor.ask<Audit>(auditAsk(spec, gateOut));
      if (spec.specialist !== null) {
        auditLineOk = lineVerified(persona, audit.contractLine);
        if (!auditLineOk && !auditRetriedLine) {
          auditRetriedLine = true;
          const firstIssues = audit.issues;
          audit = await auditor.ask<Audit>(CONTRACTLINE_RETRY);
          // an empty re-answer must not erase the substantive first one
          if (audit.issues.length === 0 && firstIssues.length > 0) {
            audit = { ...audit, issues: firstIssues };
          }
          auditLineOk = lineVerified(persona, audit.contractLine);
        }
      }

      if (audit.issues.length === 0 && gateOut === "") {
        converged = true;
        break;
      }
      remaining = audit.issues.map((f) => `[${f.severity}] ${f.where}: ${f.problem}`);
      if (gateOut !== "" && remaining.length === 0) {
        remaining = ["rustfmt --edition 2024 --check still reports formatting diffs; see the gate output in the audit"];
      }
      report({ name: spec.name, phase: "fixing", summary: `${audit.issues.length} finding(s)` }, "areas");
      const feedback = [
        gateOut ? `Formatter gate output (rustfmt --edition 2024 --check):\n${gateOut}` : "",
        ...audit.issues.map((f) => `- [${f.severity}] ${f.where}: ${f.problem}`),
      ]
        .filter(Boolean)
        .join("\n");
      await impl.ask<FixResult>(
        [
          `The auditor reviewed your area's files (${spec.files.join(", ")}). Fix every finding below inside the files you own — nothing else. Re-run rustfmt --edition 2024 (write mode) on each Rust file you change. Do not run cargo, rustc, tsc, nsh, or npm; no git operations.`,
          "",
          feedback,
        ].join("\n"),
      );
    }

    if (!converged) status = "not-converged";
    const boardPhase = status === "done" ? "done" : "not converged";
    const summary =
      made.summary +
      (converged
        ? ` — audit converged in ${rounds} round(s).`
        : ` — audit did NOT converge: ${rounds} round(s) used; the fixes after the final audit are applied but unverified.`);
    report({ name: spec.name, phase: boardPhase, summary }, "areas");
    return {
      name: spec.name,
      status,
      summary,
      rounds,
      remainingIssues: converged ? [] : remaining,
      personaVerified: spec.specialist === null ? null : implLineOk === true && auditLineOk === true,
      blockers: made.blockers ?? [],
    };
  } catch (err) {
    const summary = `${spec.title} failed: ${String(err)}`;
    report({ name: spec.name, phase: "failed", summary }, "areas");
    return {
      name: spec.name,
      status: "failed",
      summary,
      rounds: 0,
      remainingIssues: [],
      personaVerified: null,
      blockers: [String(err)],
    };
  }
}

phase("Implement and audit each area in parallel — up to 3 audit rounds per area");
log(`${AREAS.length} areas, disjoint files, one locked contract`);
const areaResults = await Promise.all(AREAS.map((spec) => runArea(spec)));
log(
  `${areaResults.filter((r) => r.status === "done").length}/${AREAS.length} areas converged; ` +
    `${areaResults.filter((r) => r.status === "not-converged").length} not converged; ` +
    `${areaResults.filter((r) => r.status === "failed").length} failed`,
);

// ---------------------------------------------------------------- whole-tree consistency

const ALL_RS_FILES = [
  "crates/nsh-camera/src/lib.rs",
  "crates/nsh-camera/src/camera.rs",
  "crates/nsh-camera/src/device.rs",
  "crates/nsh-camera/src/error.rs",
  "crates/nsh-camera/src/options.rs",
  "crates/nsh-camera/src/backend.rs",
  "crates/nsh-camera/src/fake.rs",
  "crates/nsh-camera/src/platform/mod.rs",
  "crates/nsh-camera/src/platform/unsupported.rs",
  "crates/nsh-camera/src/platform/apple.rs",
  "crates/nsh-camera/src/platform/android.rs",
  "crates/nsh-camera/src/platform/windows.rs",
  "crates/nsh-camera/src/platform/linux.rs",
  "crates/nsh-camera/tests/error_codes.rs",
  "crates/nsh-camera/tests/exactly_once.rs",
  "crates/nsh-camera/tests/edge_cases.rs",
  "crates/nsh-camera/tests/fake_backend.rs",
  "crates/nsh-camera/tests/bridges.rs",
];

function treeAuditAsk(gateOut: string): string {
  return [
    `Cross-check the whole tree in ${REPO} after twelve areas wrote files in parallel. Read-only: do not edit, create or delete any file; do not run cargo, rustc, tsc, nsh, npm, or any build/test command; no git operations. You may read every project file and the .refs/ reference material.`,
    "",
    "Check exactly these cross-file seams:",
    "1. Workspace wiring: root Cargo.toml members and the crate manifest; crates/nsh-camera/src/lib.rs — every declared mod has a matching file, every re-exported name exists as a pub item with that exact name, platform/mod.rs declares the five platform modules; the old root src/ and tests/ are gone.",
    "2. Error-code parity across three files: crates/nsh-camera/src/error.rs kinds and codes, packages/nsh-camera/src/errors.ts CameraErrorCode union and MESSAGES sentences, docs/goals.md's error table — same 14 kinds, same code strings, same message wording.",
    "3. Edge-test parity: docs/goals.md's edge table vs crates/nsh-camera/tests/edge_cases.rs function names AND packages/nsh-camera/tests/edge-cases.test.tsx test titles — every locked name exists exactly on both sides.",
    "4. Rust/TS API-name parity for the covered core: Camera, CameraDevice, PreviewStream, RecordingSession, the four backend interfaces, and every options type exist with matching names (snake_case vs camelCase) in crates/nsh-camera/src/{camera,device,options,backend}.rs and packages/nsh-camera/src/{camera,device,options,backend}.ts; the semantics rules are present in both.",
    "5. tests/*.rs and tests/*.test.tsx call only the public API that exists (items, signatures, FakeBackend/memoryBackend scripting methods, bridge constructors); trait imports in scope wherever trait methods are called.",
    "6. Parity completeness: re-grep the reference export lists (.refs/flutter-packages/packages/camera/camera/lib/camera.dart + camera_platform_interface exports + src/camera_controller.dart public methods; .refs/react-native-vision-camera/packages/react-native-vision-camera/src/index.ts module list) against docs/parity.md — every public reference API must have a row; every Not covered row carries a reason; the honesty banner is present.",
    "7. CI vs claims: .github/workflows/ci.yml's commands match README.md's Checks section word-for-word in meaning; ci.yml references only files the planned tree creates; pages.yml untouched.",
    "8. AGENTS.md gained exactly the one parity bullet; docs/decisions.md records the STEP 0 reference table with all six .refs/ paths and the pinned-but-not-wired binding decision.",
    "9. AGENTS.md sweep across all changed files: comments 1-2 lines stating non-obvious constraints; no dead code; no speculative abstractions; docs tone direct.",
    gateOut
      ? `The script's rustfmt --edition 2024 --check gate (formatter only, not a build) reported non-zero; every affected file must appear in findings:\n${gateOut}`
      : "The rustfmt gate output is not attached; flag nothing about formatting unless you see an obvious deviation while reading.",
    "",
    "Locked error-code table:",
    ERROR_CONTRACT,
    "",
    EDGE_TESTS,
    "",
    "Return ONLY actionable findings with file:line pointers; an empty issues array means the tree is consistent. No PASS notes.",
    CONTRACTLINE_NOTE,
  ].join("\n");
}

const treePersona = await specialist(
  "z-rust-engineer",
  plainPersona("whole-tree consistency auditor and fixer for a dual Rust/TypeScript camera repo"),
);
const treeAuditor = agent("Whole-tree auditor", { system: treePersona, model: MODELS.pro });
const treeFixer = agent("Whole-tree fixer", { system: treePersona, model: MODELS.pro });

let treeIssues: AuditFinding[] = [];
let treeRounds = 0;
let treeConverged = false;
let treeFmtClean = true;

phase("Audit the whole tree once and reconcile what drifted");
for (const r of [1, 2, 3]) {
  treeRounds = r;
  let gateOut = "";
  try {
    const gate = await world.run("rustfmt", ["--edition", "2024", "--check", ...ALL_RS_FILES], {
      timeoutMs: 120000,
    });
    if (gate.exitCode !== 0) gateOut = `${gate.stdout}\n${gate.stderr}`.trim();
  } catch (err) {
    gateOut = `rustfmt gate could not run: ${String(err)}`;
  }
  treeFmtClean = gateOut === "";

  let audit = await treeAuditor.ask<Audit>(treeAuditAsk(gateOut));
  if (!lineVerified(treePersona, audit.contractLine)) {
    const firstIssues = audit.issues;
    audit = await treeAuditor.ask<Audit>(CONTRACTLINE_RETRY);
    // an empty re-answer must not erase the substantive first one
    if (audit.issues.length === 0 && firstIssues.length > 0) {
      audit = { ...audit, issues: firstIssues };
    }
  }
  treeIssues = audit.issues;
  if (gateOut === "" && audit.issues.length === 0) {
    treeConverged = true;
    treeFmtClean = true;
    break;
  }

  const feedback = [
    gateOut ? `Formatter gate output (rustfmt --edition 2024 --check):\n${gateOut}` : "",
    ...audit.issues.map((f) => `- [${f.severity}] ${f.where}: ${f.problem}`),
  ]
    .filter(Boolean)
    .join("\n");
  await treeFixer.ask<FixResult>(
    [
      `The whole-tree audit found inconsistencies in ${REPO}. Fix every finding below, editing only what a finding names (plus the directly dependent lines). Re-run rustfmt --edition 2024 (write mode) on each Rust file you change. Do not run cargo, rustc, tsc, nsh, or npm; no git operations; keep every status claim in docs honest.`,
      "",
      feedback,
      "",
      CONTRACTLINE_NOTE,
    ].join("\n"),
  );
}
log(
  treeConverged
    ? `whole-tree audit converged in ${treeRounds} round(s)`
    : `whole-tree audit did NOT converge in ${treeRounds} round(s); ${treeIssues.length} finding(s) remain`,
);
if (!treeConverged && !treeFmtClean) {
  log("the final formatter gate still reported diffs");
}

// ---------------------------------------------------------------- report

const openFindings: ReportedFinding[] = [
  ...areaResults
    .filter((a) => a.status !== "done")
    .flatMap((a) =>
      a.remainingIssues.map((issue) => ({
        where: `area "${a.name}"`,
        what: issue,
        evidence: `last audit of ${a.name}: the round cap was reached; fixes applied after the final audit are unverified`,
        status: "unconfirmed" as const,
        severity: /\[high\]/.test(issue) ? ("high" as const) : ("medium" as const),
      })),
    ),
  ...treeIssues.map((f) => ({
    where: f.where,
    what: f.problem,
    evidence: "whole-tree consistency audit ended with the cap reached without a clean pass",
    status: "unconfirmed" as const,
    severity: f.severity,
  })),
];

const verifiedLines: string[] = [
  "Every Rust file passed the script's 'rustfmt --edition 2024 --check' formatter gate when its area converged (formatter only, not a build; no compile).",
  `Each of the ${AREAS.length} areas was audited by a dedicated read-only auditor against the locked contract, up to 3 rounds, until zero actionable findings.`,
  "A whole-tree consistency audit checked: workspace wiring, error-code parity across error.rs/errors.ts/goals.md, edge-test names on both languages, Rust/TS API-name parity, parity.md's reference enumeration against the .refs/ export lists, ci.yml commands vs README claims, and the AGENTS.md/decisions records.",
  `Specialist personas were runtime-loaded for the Rust and TSX areas (z-rust-engineer, z-nsh-engineer); delivery verified per area: ${areaResults
    .map((a) => `${a.name}: ${a.personaVerified === null ? "plain persona" : a.personaVerified ? "verified" : "unverified"}`)
    .join(", ")}.`,
];

const notCoveredLines: string[] = [
  "The CI gates (cargo fmt/clippy/test, nsh check/build/test) were NOT run: AGENTS.md forbids building or testing on this machine; they run in GitHub Actions on the next commit/push. Nothing was committed or pushed, so compile, typecheck, and test verification is pending CI.",
  "The TS side has no formatter gate (the org's CI has none), so TS style was matched to the biometrics exemplar by review only.",
  "Real device behavior: no native link layer is wired; AVFoundation/CameraX/nokhwa paths are design seams only (docs/parity.md).",
  "Web platform: out of scope per docs/brief.md.",
  "AGENTS.md's 'a test is seen to fail once before it counts' cannot be observed without running tests; it applies when CI first runs.",
];

const doneCount = areaResults.filter((a) => a.status === "done").length;
const notConvergedAreas = areaResults.filter((a) => a.status === "not-converged");
const failedAreas = areaResults.filter((a) => a.status === "failed");
const conclusion = [
  `${doneCount} of ${AREAS.length} areas converged (implement, then audit until zero findings, cap 3 rounds).`,
  notConvergedAreas.length > 0
    ? `${notConvergedAreas.map((a) => a.name).join(", ")} did NOT converge within the cap; their last findings are reported as unconfirmed.`
    : "No area hit the audit cap.",
  failedAreas.length > 0 ? `Failed areas: ${failedAreas.map((a) => a.name).join(", ")}.` : "",
  treeConverged
    ? `The whole-tree consistency audit converged in ${treeRounds} round(s).`
    : `The whole-tree consistency audit did NOT converge within ${treeRounds} round(s); its open findings are reported as unconfirmed.`,
  "The CI gates (Rust fmt/clippy/test, TS nsh check/build/test) remain unverified by design: AGENTS.md runs them in GitHub Actions only, and this run made no commit or push.",
]
  .filter(Boolean)
  .join(" ");

const reportLines = [
  "# nsh-camera workflow report",
  "",
  "Twelve areas with disjoint files ran in parallel against one locked contract derived from the STEP 0 references: the biometrics layout with a Rust crate and a TypeScript package sharing one API, error codes and edge cases covering the Flutter and React Native references, and a parity table enumerating every reference public API. CI runs all compiling and testing; this run made no git operation.",
  "",
  "## Areas",
  ...areaResults.map(
    (a) =>
      `- **${a.name}** — ${a.status} (${a.rounds} audit round(s)): ${a.summary}` +
      (a.remainingIssues.length ? ` Open: ${a.remainingIssues.join("; ")}.` : "") +
      (a.blockers.length ? ` Blockers: ${a.blockers.join("; ")}.` : ""),
  ),
  "",
  "## Whole-tree consistency audit",
  treeConverged
    ? `- converged after ${treeRounds} round(s); no open findings.`
    : `- did NOT converge after ${treeRounds} round(s); open findings: ${
        treeIssues.map((f) => `${f.where}: ${f.problem}`).join("; ") || "none recorded"
      }.`,
  "",
  "## What was verified",
  ...verifiedLines.map((v) => `- ${v}`),
  "",
  "## What was not covered",
  ...notCoveredLines.map((v) => `- ${v}`),
];

await artifact.markdown("report", reportLines.join("\n"), {
  title: "nsh-camera implementation report",
  description: "Per-area outcomes, audit convergence, and what remains unverified until CI runs",
  primary: true,
});

return {
  conclusion,
  areas: areaResults,
  findings: openFindings,
  verified: verifiedLines,
  notCovered: notCoveredLines,
};
