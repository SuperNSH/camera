//! The default until a native backend is wired: an unwired camera is an unavailable camera.

use crate::{
    backend::{Backend, DeviceBackend},
    error::{CameraError, ErrorKind},
    options::{CameraId, CameraInfo, PermissionState},
};

/// No capture service exists on this platform yet: every call, the permission probe included,
/// resolves not-available.
#[derive(Debug, Default)]
pub struct UnsupportedBackend;

impl Backend for UnsupportedBackend {
    fn permission(&self) -> Result<PermissionState, CameraError> {
        Err(CameraError::new(ErrorKind::NotAvailable))
    }

    fn request_permission(&self) -> Result<PermissionState, CameraError> {
        Err(CameraError::new(ErrorKind::NotAvailable))
    }

    fn devices(&self) -> Result<Vec<CameraInfo>, CameraError> {
        Err(CameraError::new(ErrorKind::NotAvailable))
    }

    fn open_device(&self, _id: &CameraId) -> Result<Box<dyn DeviceBackend>, CameraError> {
        Err(CameraError::new(ErrorKind::NotAvailable))
    }
}
