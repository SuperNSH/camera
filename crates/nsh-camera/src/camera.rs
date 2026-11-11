//! `Camera`: the calls an app makes — the permission, the device list, opening one device.

use std::sync::Arc;

use crate::{
    backend::Backend,
    device::CameraDevice,
    error::{CameraError, ErrorKind},
    options::{CameraId, CameraInfo, PermissionState},
    platform::UnsupportedBackend,
};

/// The camera service of one backend.
///
/// [`Camera::new`] has no native link wired this release, so listing, asking and opening
/// resolve `ERR_CAMERA_NOT_AVAILABLE`; [`Camera::with_backend`] is where tests, fakes and the
/// platform bridges plug in.
pub struct Camera {
    backend: Arc<dyn Backend>,
}

impl Camera {
    /// The platform default: an unsupported backend, because no native link is wired this
    /// release. `permission` reports [`PermissionState::NotDetermined`]; every ask errs.
    pub fn new() -> Self {
        Self::with_backend(Arc::new(UnsupportedBackend))
    }

    /// A camera over `backend`. The `Arc` is stored as given, so holders share one backend.
    pub fn with_backend(backend: Arc<dyn Backend>) -> Self {
        Self { backend }
    }

    /// The permission state as the platform reports it. Reports; never asks.
    pub fn permission(&self) -> Result<PermissionState, CameraError> {
        self.backend.permission()
    }

    /// Asks for the camera permission once where the platform asks once; on iOS a decline
    /// turns permanent and only the system settings can change it.
    pub fn request_permission(&self) -> Result<PermissionState, CameraError> {
        self.backend.request_permission()
    }

    /// The platform's cameras; an empty list when none are present.
    pub fn devices(&self) -> Result<Vec<CameraInfo>, CameraError> {
        self.backend.devices()
    }

    /// Opens one camera by id. An empty id is an invalid argument and never reaches the
    /// backend; an unknown id resolves not-available.
    pub fn open(&self, id: &CameraId) -> Result<CameraDevice, CameraError> {
        if id.0.is_empty() {
            return Err(CameraError::new(ErrorKind::InvalidArgument));
        }
        Ok(CameraDevice::new(self.backend.open_device(id)?))
    }
}

impl Default for Camera {
    fn default() -> Self {
        Self::new()
    }
}
