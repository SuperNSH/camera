//! Photo capture, video recording and live preview for Native Shell apps.
//!
//! Native link layers are not wired this release: every bridge runs through a `NullLink` and
//! resolves `ERR_CAMERA_NOT_AVAILABLE`; see docs/parity.md for what is covered.

mod backend;
mod camera;
mod device;
mod error;
mod fake;
mod options;
mod platform;

pub use backend::{Backend, DeviceBackend, PreviewBackend, RecordingBackend};
pub use camera::Camera;
pub use device::{CameraDevice, PreviewStream, RecordingSession};
pub use error::{CameraError, ErrorKind};
pub use fake::FakeBackend;
pub use options::{
    CameraId, CameraInfo, CameraPosition, Frame, Orientation, PermissionState, Photo, PhotoOptions,
    Recording, RecordingOptions, Resolution,
};
pub use platform::{
    AndroidBackend, AppleBackend, LinuxBackend, UnsupportedBackend, WindowsBackend,
};
