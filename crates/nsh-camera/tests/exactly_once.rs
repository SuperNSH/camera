use std::sync::Arc;

use nsh_camera::{
    Camera, CameraDevice, CameraId, CameraInfo, CameraPosition, FakeBackend, PhotoOptions,
    RecordingOptions,
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
fn cancel_then_stop_reports_already_resolved() {
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
fn double_cancel_reports_already_resolved() {
    let (camera, _backend) = scripted_camera();
    let device = open_back(&camera);
    let session = device
        .start_recording(&RecordingOptions::default())
        .expect("start recording");
    session.cancel().expect("cancel resolves the recording");

    let error = session.cancel().err().expect("cancel twice");
    assert_eq!(error.code(), "ERR_CAMERA_ALREADY_RESOLVED");
}

#[test]
fn stop_then_cancel_reports_already_resolved() {
    let (camera, _backend) = scripted_camera();
    let device = open_back(&camera);
    let session = device
        .start_recording(&RecordingOptions::default())
        .expect("start recording");
    session.stop().expect("stop resolves the recording");

    let error = session.cancel().err().expect("cancel after stop");
    assert_eq!(error.code(), "ERR_CAMERA_ALREADY_RESOLVED");
}

#[test]
fn interrupted_stop_then_cancel_reports_already_resolved() {
    let (camera, backend) = scripted_camera();
    let device = open_back(&camera);
    let session = device
        .start_recording(&RecordingOptions::default())
        .expect("start recording");
    backend.interrupt_recording();

    let error = session.stop().err().expect("interrupted stop");
    assert_eq!(error.code(), "ERR_CAMERA_INTERRUPTED");

    let error = session
        .cancel()
        .err()
        .expect("cancel after the interruption resolved the session");
    assert_eq!(error.code(), "ERR_CAMERA_ALREADY_RESOLVED");
}

#[test]
fn capture_after_device_close_reports_already_resolved() {
    let (camera, _backend) = scripted_camera();
    let device = open_back(&camera);
    device.close().expect("close resolves once");

    let error = device
        .capture_photo(&PhotoOptions::default())
        .err()
        .expect("capture after close");
    assert_eq!(error.code(), "ERR_CAMERA_ALREADY_RESOLVED");
}

#[test]
fn device_close_twice_reports_already_resolved() {
    let (camera, _backend) = scripted_camera();
    let device = open_back(&camera);
    device.close().expect("close resolves once");

    let error = device.close().err().expect("close twice");
    assert_eq!(error.code(), "ERR_CAMERA_ALREADY_RESOLVED");
}

#[test]
fn next_frame_after_preview_close_reports_already_resolved() {
    let (camera, _backend) = scripted_camera();
    let device = open_back(&camera);
    let preview = device.start_preview().expect("start preview");
    preview.close().expect("close resolves once");

    let error = preview.next_frame().err().expect("frame after close");
    assert_eq!(error.code(), "ERR_CAMERA_ALREADY_RESOLVED");
}
