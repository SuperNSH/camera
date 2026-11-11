# Decisions

Each entry says what was chosen and why. `docs/goals.md` states the goals, the exactly-once contract, the error table and where each claim is proven.

## The layout mirrors SuperNSH/biometrics

The repo was a single root crate — `Cargo.toml` and `src/lib.rs`, nothing else. The restructure moved it to the org layout: a root `Cargo.toml` workspace with the crate in `crates/nsh-camera`, the package in `packages/nsh-camera` (a TSX package with `nsh.json`, `App.tsx`, `src/`, `tests/`), docs in `docs/`, and `.github/workflows/ci.yml` running format, rust and typescript jobs. `examples/` comes later, when there is a demo worth shipping.

Consequence: two test suites, one per side, and CI gates both. Every rule in `docs/goals.md` is proven twice, once in Rust and once in TypeScript.

## The crate is std-only this release

No dependencies: no `nsh-core`, no `nokhwa`, no `objc2`, no JNI. `docs/brief.md`'s rule is that a version is checked on the registry before it is pinned, and a native backend built on unverified dependencies would be unwritable.

Consequence: `crates/nsh-camera/src/platform/` holds link-layer seams, one per platform, and every unwired link resolves `ERR_CAMERA_NOT_AVAILABLE` everywhere. The whole contract — exactly-once, the 14 codes, the edge cases — ships testable through the fake backend, and a native backend later drops in behind its seam without changing a rule.

## The native TSX binding is pinned, not wired

When `nsh-core` lands, `native.rs` exposes `#[native_module("nsh-camera/native")]` with a `NativeCamera` `#[class]` following biometrics' plain-value rule: plain arguments, plain results, rejections that carry a `code`. The package's exports then gain `"./rust"` returning `rustBackend()`, and `nsh.json` gains the `"rust"` field, the way biometrics consumes its crate.

Deferred because camera's surface crosses device handles and frame bytes, and the plain-value rule does not cover those yet. Designing that crossing needs `nsh-core`'s API in hand, not guessed at. Until then the package runs on the memory backend and nothing native is wired.

## Rust calls are synchronous; TypeScript wraps them in Promises

The Rust API is synchronous and non-blocking: every call returns an answer, a coded error or a cancel, never a wait. TypeScript wraps the same calls in Promises, so the TSX surface is awaitable the way every NSH package is.

The semantics are identical on both sides — exactly-once, the same codes, the same sentences. A behavior change lands in both, with a test in both; the same rule is in AGENTS.md.

## Error codes follow the org scheme

`ERR_CAMERA_*`, as biometrics uses `ERR_BIOMETRICS_*`: 14 kinds, one stable code per failure mode, each absorbing the reference failure modes it covers. getUserMedia's `NotFoundError` folds into `NOT_AVAILABLE`, its `NotReadableError` into `DEVICE_BUSY`, its `OverconstrainedError` into `FORMAT_UNSUPPORTED`; Android's `MAX_CAMERAS_IN_USE` into `DEVICE_BUSY`; iOS's restricted authorization into `PERMISSION_RESTRICTED`; React Native's `deniedForever` into `PERMISSION_PERMANENTLY_DENIED`; Flutter's `A video recording is already started` into `IN_PROGRESS`; `AVCaptureSession` interruptions into `INTERRUPTED`. The full table is in `docs/goals.md`.

The `Display` sentences are mirrored word-for-word in the TypeScript `MESSAGES` object, so an error reads identically on both sides, and `asCameraError` maps anything unknown to `ERR_CAMERA_BACKEND`: no error crosses without a code.

## Permission asks once, then Settings only

iOS asks once: `request_permission()` from `NotDetermined` shows the system prompt, a grant resolves `Ok(Granted)`, and a decline resolves `ERR_CAMERA_PERMISSION_DENIED` and turns the state `Denied` permanently. From then on only Settings can grant it, and `request_permission()` resolves `ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED`. Android's don't-ask-again maps to the same permanent code, and React Native's `deniedForever` with it. A restricted device (parental controls) is its own code, `ERR_CAMERA_PERMISSION_RESTRICTED`. `permission()` reports `Denied` for both permanent and restricted, because an app branches on whether it may use the camera, not on why it may not — and `permission()` only reports; it never asks.

The microphone check rides on `RecordingOptions.audio`, which defaults to `false`. A recording with `audio: true` checks the microphone permission first, and a decline resolves `ERR_CAMERA_MIC_PERMISSION_DENIED` with no recording started.

## Recording data is returned in memory

A recording comes back as bytes in memory. No file paths: Flutter's `XFile`/`videoOutputPath` and React Native's `saveToFile` are non-goals.

Consequence: a long recording costs memory, and an app that wants a file writes it itself. The gain is a seam that runs and tests on every CI runner with no filesystem involved.

## One recording per device

Flutter's guard is the model: `startRecording` called twice throws `A video recording is already started`. Here, a second `start_recording` while one runs resolves `ERR_CAMERA_IN_PROGRESS`.

The running session resolves at the first of `stop()` or `cancel()`. A later `stop()`, a later `cancel()`, and a `cancel()` after a failed `stop()` all resolve `ERR_CAMERA_ALREADY_RESOLVED`. One session, one resolution.

## Web stays out of scope

`docs/brief.md` names no web camera option. `camera_web` exists in the Flutter reference, but the brief's recommended path — nokhwa on desktop, CameraX and AVFoundation behind one native trait per platform — has no web, so there is no web backend and no web surface here. `camera_web` is enumerated in `docs/parity.md` only to say Not covered.

## Versions

Nothing external is pinned this release. The nokhwa, CameraX and AVFoundation wrappers stay unpinned until checked on the registry, as `docs/brief.md` requires; versions and licences are unverified until then.

The NSH relationship is settled, per `.refs/nsh`: TSX apps import `"nsh"` (`mount`, `signal`, `Text`, `View`) and `"nsh/test"` (`test`, `expect`), and this package follows biometrics' consumption pattern. CI installs NSH 0.4.0 exactly as biometrics does.

## The STEP 0 reference set

Cloned by the orchestrator before this work started; read-only reference material.

- `.refs/flutter-packages` — flutter/packages, shallow sparse clone. At HEAD the camera plugin lives under `packages/camera/` as a parent of the federated packages: camera (app-facing), camera_platform_interface, camera_android, camera_android_camerax, camera_avfoundation, camera_web, camera_windows.
- `.refs/react-native-vision-camera` — mrousavy/react-native-vision-camera. The package lives at packages/react-native-vision-camera (src/ index.ts re-exports devices, hooks, nitro specs, views, threading, utils; VisionCamera factory).
- `.refs/expo` — sparse clone of packages/expo-camera only. Reference-only per docs/brief.md; NOT part of the parity contract.
- `.refs/nokhwa` — l1npengtul/nokhwa. The future desktop backend; no version pinned this release.
- `.refs/nsh` — longbridge/nsh. Rust crates under crates/ (nsh-core, nsh-js, nsh-testing, nsh-engine, platform crates); TSX apps import "nsh" (mount, signal, Text, View) and "nsh/test" (test, expect).
- `.refs/biometrics` — SuperNSH/biometrics, the org layout exemplar this repo now mirrors: root Cargo.toml workspace with crates/nsh-biometrics, packages/nsh-biometrics (TSX package with nsh.json, App.tsx, src/, tests/), docs/{brief,decisions,parity}.md, .github/workflows/ci.yml (format + rust + typescript jobs).
