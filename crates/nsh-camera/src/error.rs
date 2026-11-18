//! The errors a camera call reports. Each has a stable code; the message says what to do.

use std::fmt;

/// What went wrong, as a stable code; see [`CameraError::code`].
#[non_exhaustive]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ErrorKind {
    /// No camera matches here: no device, an unknown id, or no capture service on this platform.
    NotAvailable,
    /// The camera permission was declined, but can be asked for again.
    PermissionDenied,
    /// The camera permission was declined for good; only the system settings can grant it.
    PermissionPermanentlyDenied,
    /// The camera permission is restricted, for example by parental controls.
    PermissionRestricted,
    /// The microphone permission was declined, and the recording asked for audio.
    MicPermissionDenied,
    /// The camera is in use by another app or process.
    DeviceBusy,
    /// The device cannot deliver the requested format, resolution, or frame rate.
    FormatUnsupported,
    /// Another recording is already running on this device.
    InProgress,
    /// The recording was interrupted, for example by backgrounding the app or a phone call.
    Interrupted,
    /// This platform cannot honor the requested recording orientation.
    OrientationUnsupported,
    /// The recording was cancelled before it finished.
    Cancelled,
    /// The platform's camera service failed; `status` holds its own code where it gives one.
    Backend,
    /// An argument is empty or not allowed on this platform.
    InvalidArgument,
    /// The operation already resolved; it cannot resolve again.
    AlreadyResolved,
}

/// A failed camera call, as a code an app can match on.
///
/// `Display` writes the code and the message. Nothing user-identifying is carried.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CameraError {
    kind: ErrorKind,
    status: Option<i64>,
}

impl CameraError {
    /// An error of `kind`, with no platform status.
    pub fn new(kind: ErrorKind) -> Self {
        Self { kind, status: None }
    }

    /// The same error, carrying the platform's own status code.
    #[must_use]
    pub fn with_status(mut self, status: i64) -> Self {
        self.status = Some(status);
        self
    }

    /// What went wrong.
    pub fn kind(&self) -> ErrorKind {
        self.kind
    }

    /// The platform's status code, when the platform gave one.
    pub fn status(&self) -> Option<i64> {
        self.status
    }

    /// The stable code, such as `ERR_CAMERA_NOT_AVAILABLE`. Apps match on this.
    pub fn code(&self) -> &'static str {
        self.kind.code()
    }
}

impl ErrorKind {
    /// The stable code of this kind.
    pub fn code(self) -> &'static str {
        match self {
            ErrorKind::NotAvailable => "ERR_CAMERA_NOT_AVAILABLE",
            ErrorKind::PermissionDenied => "ERR_CAMERA_PERMISSION_DENIED",
            ErrorKind::PermissionPermanentlyDenied => "ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED",
            ErrorKind::PermissionRestricted => "ERR_CAMERA_PERMISSION_RESTRICTED",
            ErrorKind::MicPermissionDenied => "ERR_CAMERA_MIC_PERMISSION_DENIED",
            ErrorKind::DeviceBusy => "ERR_CAMERA_DEVICE_BUSY",
            ErrorKind::FormatUnsupported => "ERR_CAMERA_FORMAT_UNSUPPORTED",
            ErrorKind::InProgress => "ERR_CAMERA_IN_PROGRESS",
            ErrorKind::Interrupted => "ERR_CAMERA_INTERRUPTED",
            ErrorKind::OrientationUnsupported => "ERR_CAMERA_ORIENTATION_UNSUPPORTED",
            ErrorKind::Cancelled => "ERR_CAMERA_CANCELLED",
            ErrorKind::Backend => "ERR_CAMERA_BACKEND",
            ErrorKind::InvalidArgument => "ERR_CAMERA_INVALID_ARGUMENT",
            ErrorKind::AlreadyResolved => "ERR_CAMERA_ALREADY_RESOLVED",
        }
    }

    /// What to do about it, in one sentence.
    pub fn message(self) -> &'static str {
        match self {
            ErrorKind::NotAvailable => {
                "No camera matches here: no device, an unknown id, or no capture service on this \
                 platform."
            }
            ErrorKind::PermissionDenied => {
                "The camera permission was declined. Grant it in the system settings."
            }
            ErrorKind::PermissionPermanentlyDenied => {
                "The camera permission was permanently declined. Only the system settings can \
                 grant it."
            }
            ErrorKind::PermissionRestricted => {
                "The camera permission is restricted, for example by parental controls, and \
                 cannot be requested."
            }
            ErrorKind::MicPermissionDenied => {
                "The microphone permission was declined, and the recording asked for audio."
            }
            ErrorKind::DeviceBusy => "The camera is in use by another app or process.",
            ErrorKind::FormatUnsupported => {
                "The device cannot deliver the requested format, resolution, or frame rate."
            }
            ErrorKind::InProgress => "Another recording is already running on this device.",
            ErrorKind::Interrupted => {
                "The recording was interrupted, for example by backgrounding the app or a phone \
                 call."
            }
            ErrorKind::OrientationUnsupported => {
                "This platform cannot honor the requested recording orientation."
            }
            ErrorKind::Cancelled => "The recording was cancelled before it finished.",
            ErrorKind::Backend => "The platform's camera service failed.",
            ErrorKind::InvalidArgument => "An argument is empty or not allowed on this platform.",
            ErrorKind::AlreadyResolved => {
                "The operation already resolved; it cannot resolve again."
            }
        }
    }
}

impl fmt::Display for CameraError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.kind.code(), self.kind.message())
    }
}

impl std::error::Error for CameraError {}
