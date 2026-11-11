//! The seam between [`crate::Camera`] and a platform: raw access with no rules. The
//! high-level types add the one-recording, exactly-once and argument checks on top.

use crate::{
    error::CameraError,
    options::{
        CameraId, CameraInfo, Frame, Orientation, PermissionState, Photo, PhotoOptions, Recording,
        RecordingOptions,
    },
};

/// What a platform provides: the permission, the device list, and opening one device.
///
/// Every method takes `&self`, returns at once, and resolves exactly once: implementations
/// keep any interior state behind `Arc<Mutex<..>>` and never wait on the OS or a thread.
pub trait Backend: Send + Sync {
    /// The permission state as the platform reports it. Reports; never asks.
    fn permission(&self) -> Result<PermissionState, CameraError>;

    /// Asks for the permission, once where the platform only asks once.
    fn request_permission(&self) -> Result<PermissionState, CameraError>;

    /// The platform's cameras; `Ok` with an empty list when none are present.
    fn devices(&self) -> Result<Vec<CameraInfo>, CameraError>;

    /// Opens the camera `id`.
    ///
    /// The returned box is `'static`: the device owns its platform link through `Arc`'d
    /// interior state, so no borrowed lifetime crosses the trait.
    fn open_device(&self, id: &CameraId) -> Result<Box<dyn DeviceBackend>, CameraError>;
}

/// One open camera: photos, preview, and one recording at a time.
pub trait DeviceBackend: Send + Sync {
    /// Captures one photo. `options` arrived already validated by the high-level device.
    fn capture_photo(&self, options: &PhotoOptions) -> Result<Photo, CameraError>;

    /// Starts the preview; the returned box is `'static`, as `Backend::open_device` notes.
    fn start_preview(&self) -> Result<Box<dyn PreviewBackend>, CameraError>;

    /// Starts one recording; a second while one runs is refused by the high-level device.
    fn start_recording(
        &self,
        options: &RecordingOptions,
    ) -> Result<Box<dyn RecordingBackend>, CameraError>;

    /// Closes the device. The first close wins; later calls AlreadyResolved.
    fn close(&self) -> Result<(), CameraError>;
}

/// A running preview: frames on demand until it closes.
pub trait PreviewBackend: Send + Sync {
    /// The next frame, or `ERR_CAMERA_NOT_AVAILABLE` while none is ready. Never blocks.
    fn next_frame(&self) -> Result<Frame, CameraError>;

    /// Stops the preview. The first close wins; later calls AlreadyResolved.
    fn close(&self) -> Result<(), CameraError>;
}

/// A running recording: its orientation, and exactly one of `stop` or `cancel`.
pub trait RecordingBackend: Send + Sync {
    /// The orientation the recording holds right now; it may change while recording runs.
    fn orientation(&self) -> Orientation;

    /// Finishes the recording and returns its bytes. An interrupted OS recording errs here.
    fn stop(&self) -> Result<Recording, CameraError>;

    /// Abandons the recording; no bytes come back.
    fn cancel(&self) -> Result<(), CameraError>;
}
