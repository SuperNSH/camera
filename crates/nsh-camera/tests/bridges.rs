use std::sync::Arc;

use nsh_camera::{
    AndroidBackend, AppleBackend, Camera, CameraId, LinuxBackend, PermissionState, WindowsBackend,
};

fn assert_unwired_reports_not_available(camera: &Camera) {
    let error = camera
        .permission()
        .err()
        .expect("permission through an unwired link");
    assert_eq!(error.code(), "ERR_CAMERA_NOT_AVAILABLE");

    let error = camera
        .request_permission()
        .err()
        .expect("permission request through an unwired link");
    assert_eq!(error.code(), "ERR_CAMERA_NOT_AVAILABLE");

    let error = camera
        .devices()
        .err()
        .expect("device list through an unwired link");
    assert_eq!(error.code(), "ERR_CAMERA_NOT_AVAILABLE");

    let error = camera
        .open(&CameraId("any".to_string()))
        .err()
        .expect("open through an unwired link");
    assert_eq!(error.code(), "ERR_CAMERA_NOT_AVAILABLE");
}

#[test]
fn apple_bridge_reports_not_available() {
    let camera = Camera::with_backend(Arc::new(AppleBackend::new()));
    assert_unwired_reports_not_available(&camera);
}

#[test]
fn android_bridge_reports_not_available() {
    let camera = Camera::with_backend(Arc::new(AndroidBackend::new()));
    assert_unwired_reports_not_available(&camera);
}

#[test]
fn windows_bridge_reports_not_available() {
    let camera = Camera::with_backend(Arc::new(WindowsBackend::new()));
    assert_unwired_reports_not_available(&camera);
}

#[test]
fn linux_bridge_reports_not_available() {
    let camera = Camera::with_backend(Arc::new(LinuxBackend::new()));
    assert_unwired_reports_not_available(&camera);
}

#[test]
fn unsupported_default_backend_reports_not_available() {
    let camera = Camera::new();

    let state = camera
        .permission()
        .expect("the default backend never asked for permission");
    assert_eq!(state, PermissionState::NotDetermined);

    let error = camera
        .request_permission()
        .err()
        .expect("permission request through the default backend");
    assert_eq!(error.code(), "ERR_CAMERA_NOT_AVAILABLE");

    let error = camera
        .devices()
        .err()
        .expect("device list through the default backend");
    assert_eq!(error.code(), "ERR_CAMERA_NOT_AVAILABLE");

    let error = camera
        .open(&CameraId("x".into()))
        .err()
        .expect("open through the default backend");
    assert_eq!(error.code(), "ERR_CAMERA_NOT_AVAILABLE");
}
