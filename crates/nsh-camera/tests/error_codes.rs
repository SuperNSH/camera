use nsh_camera::{CameraError, ErrorKind};

#[test]
fn not_available_code_is_stable() {
    assert_eq!(ErrorKind::NotAvailable.code(), "ERR_CAMERA_NOT_AVAILABLE");
}

#[test]
fn permission_denied_code_is_stable() {
    assert_eq!(
        ErrorKind::PermissionDenied.code(),
        "ERR_CAMERA_PERMISSION_DENIED"
    );
}

#[test]
fn permission_permanently_denied_code_is_stable() {
    assert_eq!(
        ErrorKind::PermissionPermanentlyDenied.code(),
        "ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED"
    );
}

#[test]
fn permission_restricted_code_is_stable() {
    assert_eq!(
        ErrorKind::PermissionRestricted.code(),
        "ERR_CAMERA_PERMISSION_RESTRICTED"
    );
}

#[test]
fn mic_permission_denied_code_is_stable() {
    assert_eq!(
        ErrorKind::MicPermissionDenied.code(),
        "ERR_CAMERA_MIC_PERMISSION_DENIED"
    );
}

#[test]
fn device_busy_code_is_stable() {
    assert_eq!(ErrorKind::DeviceBusy.code(), "ERR_CAMERA_DEVICE_BUSY");
}

#[test]
fn format_unsupported_code_is_stable() {
    assert_eq!(
        ErrorKind::FormatUnsupported.code(),
        "ERR_CAMERA_FORMAT_UNSUPPORTED"
    );
}

#[test]
fn in_progress_code_is_stable() {
    assert_eq!(ErrorKind::InProgress.code(), "ERR_CAMERA_IN_PROGRESS");
}

#[test]
fn interrupted_code_is_stable() {
    assert_eq!(ErrorKind::Interrupted.code(), "ERR_CAMERA_INTERRUPTED");
}

#[test]
fn orientation_unsupported_code_is_stable() {
    assert_eq!(
        ErrorKind::OrientationUnsupported.code(),
        "ERR_CAMERA_ORIENTATION_UNSUPPORTED"
    );
}

#[test]
fn cancelled_code_is_stable() {
    assert_eq!(ErrorKind::Cancelled.code(), "ERR_CAMERA_CANCELLED");
}

#[test]
fn backend_code_is_stable() {
    assert_eq!(ErrorKind::Backend.code(), "ERR_CAMERA_BACKEND");
}

#[test]
fn invalid_argument_code_is_stable() {
    assert_eq!(
        ErrorKind::InvalidArgument.code(),
        "ERR_CAMERA_INVALID_ARGUMENT"
    );
}

#[test]
fn already_resolved_code_is_stable() {
    assert_eq!(
        ErrorKind::AlreadyResolved.code(),
        "ERR_CAMERA_ALREADY_RESOLVED"
    );
}

#[test]
fn display_contains_the_code_and_message() {
    let error = CameraError::new(ErrorKind::DeviceBusy);
    let text = error.to_string();
    assert!(text.contains(error.code()));
    assert!(text.contains("The camera is in use by another app or process."));
}
