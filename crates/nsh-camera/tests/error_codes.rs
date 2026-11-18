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

#[test]
fn every_kind_carries_its_locked_sentence() {
    let table = [
        (
            ErrorKind::NotAvailable,
            "No camera matches here: no device, an unknown id, or no capture service on this platform.",
        ),
        (
            ErrorKind::PermissionDenied,
            "The camera permission was declined. Grant it in the system settings.",
        ),
        (
            ErrorKind::PermissionPermanentlyDenied,
            "The camera permission was permanently declined. Only the system settings can grant it.",
        ),
        (
            ErrorKind::PermissionRestricted,
            "The camera permission is restricted, for example by parental controls, and cannot be requested.",
        ),
        (
            ErrorKind::MicPermissionDenied,
            "The microphone permission was declined, and the recording asked for audio.",
        ),
        (
            ErrorKind::DeviceBusy,
            "The camera is in use by another app or process.",
        ),
        (
            ErrorKind::FormatUnsupported,
            "The device cannot deliver the requested format, resolution, or frame rate.",
        ),
        (
            ErrorKind::InProgress,
            "Another recording is already running on this device.",
        ),
        (
            ErrorKind::Interrupted,
            "The recording was interrupted, for example by backgrounding the app or a phone call.",
        ),
        (
            ErrorKind::OrientationUnsupported,
            "This platform cannot honor the requested recording orientation.",
        ),
        (
            ErrorKind::Cancelled,
            "The recording was cancelled before it finished.",
        ),
        (ErrorKind::Backend, "The platform's camera service failed."),
        (
            ErrorKind::InvalidArgument,
            "An argument is empty or not allowed on this platform.",
        ),
        (
            ErrorKind::AlreadyResolved,
            "The operation already resolved; it cannot resolve again.",
        ),
    ];
    assert_eq!(table.len(), 14);
    for (kind, sentence) in table {
        assert_eq!(kind.message(), sentence);
        assert_eq!(
            CameraError::new(kind).to_string(),
            format!("{}: {}", kind.code(), sentence)
        );
    }
}
