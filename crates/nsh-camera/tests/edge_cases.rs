use std::sync::Arc;

use nsh_camera::{
    Camera, CameraDevice, CameraError, CameraId, CameraInfo, CameraPosition, ErrorKind,
    FakeBackend, Orientation, PermissionState, PhotoOptions, RecordingOptions, Resolution,
};

fn back_id() -> CameraId {
    CameraId("back".to_string())
}

fn scripted_camera() -> (Camera, Arc<FakeBackend>) {
    let backend = Arc::new(FakeBackend::new());
    backend.with_devices(vec![CameraInfo {
        id: back_id(),
        name: "Fake back camera".to_string(),
        position: CameraPosition::Back,
    }]);
    (Camera::with_backend(backend.clone()), backend)
}

fn open_back(camera: &Camera) -> CameraDevice {
    camera.open(&back_id()).expect("open the scripted device")
}

#[test]
fn permission_denied_on_ios_asks_once_then_requires_settings() {
    let backend = Arc::new(FakeBackend::new());
    let camera = Camera::with_backend(backend.clone());
    backend.deny_permission_once();

    let error = camera
        .request_permission()
        .err()
        .expect("first ask declines");
    assert_eq!(error.code(), "ERR_CAMERA_PERMISSION_DENIED");

    let state = camera.permission().expect("state after the decline");
    assert_eq!(state, PermissionState::Denied);

    let error = camera
        .request_permission()
        .err()
        .expect("second ask requires settings");
    assert_eq!(error.code(), "ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED");
}

#[test]
fn restricted_permission_maps_to_permission_restricted() {
    let backend = Arc::new(FakeBackend::new());
    let camera = Camera::with_backend(backend.clone());
    backend.restrict_permission();

    let error = camera
        .request_permission()
        .err()
        .expect("restricted ask never prompts");
    assert_eq!(error.code(), "ERR_CAMERA_PERMISSION_RESTRICTED");

    let state = camera
        .permission()
        .expect("restricted state reports denied");
    assert_eq!(state, PermissionState::Denied);
}

#[test]
fn simulator_without_camera_reports_not_available() {
    let backend = Arc::new(FakeBackend::new());
    let camera = Camera::with_backend(backend.clone());

    let devices = camera.devices().expect("a simulator lists no cameras");
    assert!(devices.is_empty());

    let error = camera
        .open(&CameraId("missing".to_string()))
        .err()
        .expect("no scripted camera matches the id");
    assert_eq!(error.code(), "ERR_CAMERA_NOT_AVAILABLE");
}

#[test]
fn device_busy_reports_device_busy() {
    let (camera, backend) = scripted_camera();
    backend.fail_open_with(CameraError::new(ErrorKind::DeviceBusy));

    let error = camera
        .open(&back_id())
        .err()
        .expect("device held elsewhere");
    assert_eq!(error.code(), "ERR_CAMERA_DEVICE_BUSY");
}

#[test]
fn mic_permission_denied_fails_recording_with_audio() {
    let (camera, backend) = scripted_camera();
    let device = open_back(&camera);
    backend.deny_microphone();

    let with_audio = RecordingOptions {
        audio: true,
        ..RecordingOptions::default()
    };
    let error = device
        .start_recording(&with_audio)
        .err()
        .expect("microphone permission declined");
    assert_eq!(error.code(), "ERR_CAMERA_MIC_PERMISSION_DENIED");

    // The refused start left no recording, so the device is free again.
    device
        .start_recording(&RecordingOptions::default())
        .expect("starts without audio");
}

#[test]
fn orientation_change_while_recording_updates_session() {
    let (camera, backend) = scripted_camera();
    let device = open_back(&camera);
    let session = device
        .start_recording(&RecordingOptions::default())
        .expect("start recording");

    backend.set_orientation(Orientation::LandscapeLeft);
    assert_eq!(session.orientation(), Orientation::LandscapeLeft);

    session
        .stop()
        .expect("an orientation change does not fail the recording");
}

#[test]
fn orientation_lock_platform_cannot_honor_is_orientation_unsupported() {
    let (camera, backend) = scripted_camera();
    let device = open_back(&camera);
    backend.fail_recording_with(CameraError::new(ErrorKind::OrientationUnsupported));

    let locked = RecordingOptions {
        orientation: Some(Orientation::PortraitDown),
        ..RecordingOptions::default()
    };
    let error = device
        .start_recording(&locked)
        .err()
        .expect("locked orientation the platform cannot honor");
    assert_eq!(error.code(), "ERR_CAMERA_ORIENTATION_UNSUPPORTED");
}

#[test]
fn backgrounded_interruption_resolves_recording_as_interrupted() {
    let (camera, backend) = scripted_camera();
    let device = open_back(&camera);
    let session = device
        .start_recording(&RecordingOptions::default())
        .expect("start recording");
    backend.interrupt_recording();

    let error = session.stop().err().expect("backgrounded interruption");
    assert_eq!(error.code(), "ERR_CAMERA_INTERRUPTED");

    let error = session
        .cancel()
        .err()
        .expect("the interruption already resolved the session");
    assert_eq!(error.code(), "ERR_CAMERA_ALREADY_RESOLVED");
}

#[test]
fn caller_cancel_resolves_recording_as_cancelled() {
    let (camera, _backend) = scripted_camera();
    let device = open_back(&camera);
    let session = device
        .start_recording(&RecordingOptions::default())
        .expect("start recording");
    session.cancel().expect("cancel resolves the recording");

    let error = session.stop().err().expect("stop after cancel");
    assert_eq!(error.code(), "ERR_CAMERA_ALREADY_RESOLVED");
}

#[test]
fn second_recording_while_first_runs_is_in_progress() {
    let (camera, _backend) = scripted_camera();
    let device = open_back(&camera);
    let _first = device
        .start_recording(&RecordingOptions::default())
        .expect("first recording starts");

    let error = device
        .start_recording(&RecordingOptions::default())
        .err()
        .expect("one recording at a time");
    assert_eq!(error.code(), "ERR_CAMERA_IN_PROGRESS");
}

#[test]
fn unsupported_format_reports_format_unsupported() {
    let (camera, backend) = scripted_camera();
    let device = open_back(&camera);
    backend.fail_capture_with(CameraError::new(ErrorKind::FormatUnsupported));

    let beyond_the_device = PhotoOptions {
        resolution: Some(Resolution {
            width: 3840,
            height: 2160,
        }),
        ..PhotoOptions::default()
    };
    let error = device
        .capture_photo(&beyond_the_device)
        .err()
        .expect("device cannot deliver the requested format");
    assert_eq!(error.code(), "ERR_CAMERA_FORMAT_UNSUPPORTED");
}

#[test]
fn closed_preview_has_no_frames() {
    let (camera, _backend) = scripted_camera();
    let device = open_back(&camera);
    let preview = device.start_preview().expect("start preview");
    preview.close().expect("close resolves once");

    let error = preview
        .next_frame()
        .err()
        .expect("closed preview has no frames");
    assert_eq!(error.code(), "ERR_CAMERA_ALREADY_RESOLVED");
}

#[test]
fn invalid_arguments_report_invalid_argument() {
    let (camera, _backend) = scripted_camera();

    let error = camera
        .open(&CameraId(String::new()))
        .err()
        .expect("empty id refused before the backend is touched");
    assert_eq!(error.code(), "ERR_CAMERA_INVALID_ARGUMENT");

    let device = open_back(&camera);
    let empty_mime = RecordingOptions {
        mime: Some(""),
        ..RecordingOptions::default()
    };
    let error = device
        .start_recording(&empty_mime)
        .err()
        .expect("empty mime refused");
    assert_eq!(error.code(), "ERR_CAMERA_INVALID_ARGUMENT");

    let zero_fps = RecordingOptions {
        fps: Some(0),
        ..RecordingOptions::default()
    };
    let error = device
        .start_recording(&zero_fps)
        .err()
        .expect("zero fps refused");
    assert_eq!(error.code(), "ERR_CAMERA_INVALID_ARGUMENT");

    device.close().expect("close the scripted device");
    let error = device
        .start_recording(&empty_mime)
        .err()
        .expect("arguments are checked before the closed state");
    assert_eq!(error.code(), "ERR_CAMERA_INVALID_ARGUMENT");
}
