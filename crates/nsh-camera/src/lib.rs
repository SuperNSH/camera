//! Photo capture, video recording and live preview for Native Shell apps.
//!
//! Native link layers are not wired this release: every bridge runs through a `NullLink` and
//! resolves `ERR_CAMERA_NOT_AVAILABLE`; see docs/parity.md for what is covered. TSX reaches the
//! crate through `nsh-camera/native` ([`NativeCamera`]).

mod backend;
mod camera;
mod device;
mod error;
mod fake;
mod native;
mod options;
mod platform;

use nsh_core::prelude::*;

pub use backend::{Backend, DeviceBackend, PreviewBackend, RecordingBackend};
pub use camera::Camera;
pub use device::{CameraDevice, PreviewStream, RecordingSession};
pub use error::{CameraError, ErrorKind};
pub use fake::FakeBackend;
pub use native::NativeCamera;
pub use options::{
    CameraId, CameraInfo, CameraPosition, Frame, Orientation, PermissionState, Photo, PhotoOptions,
    Recording, RecordingOptions, Resolution,
};
pub use platform::{
    AndroidBackend, AppleBackend, LinuxBackend, UnsupportedBackend, WindowsBackend,
};

/// The crate's UI set: what TSX imports from `nsh-camera/native`.
#[native_module("nsh-camera/native")]
fn native(registry: &mut Registry) {
    registry.class::<NativeCamera>();
}
