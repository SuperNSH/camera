//! The device handles: photos, preview frames, and one recording at a time — each resolving
//! exactly once.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use crate::{
    backend::{DeviceBackend, PreviewBackend, RecordingBackend},
    error::{CameraError, ErrorKind},
    options::{Frame, Orientation, Photo, PhotoOptions, Recording, RecordingOptions},
};

/// The device's rule flags, shared with the recording sessions it returns.
struct DeviceRules {
    closed: bool,
    recording_active: bool,
}

struct DeviceShared {
    backend: Box<dyn DeviceBackend>,
    rules: Mutex<DeviceRules>,
}

impl DeviceShared {
    // Locks span one statement and never wrap a backend call, so they cannot poison; the
    // helper still recovers a poisoned guard instead of panicking.
    fn rules(&self) -> MutexGuard<'_, DeviceRules> {
        self.rules.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// One open camera, from [`crate::Camera::open`].
///
/// Every call after [`CameraDevice::close`] resolves `ERR_CAMERA_ALREADY_RESOLVED`, and one
/// recording runs at a time: a second start resolves `ERR_CAMERA_IN_PROGRESS`.
pub struct CameraDevice {
    shared: Arc<DeviceShared>,
}

impl CameraDevice {
    pub(crate) fn new(backend: Box<dyn DeviceBackend>) -> Self {
        Self {
            shared: Arc::new(DeviceShared {
                backend,
                rules: Mutex::new(DeviceRules {
                    closed: false,
                    recording_active: false,
                }),
            }),
        }
    }

    /// Captures one photo. An empty mime is an invalid argument and never reaches the backend.
    pub fn capture_photo(&self, options: &PhotoOptions) -> Result<Photo, CameraError> {
        if options.mime == Some("") {
            return Err(CameraError::new(ErrorKind::InvalidArgument));
        }
        if self.shared.rules().closed {
            return Err(CameraError::new(ErrorKind::AlreadyResolved));
        }
        self.shared.backend.capture_photo(options)
    }

    /// Starts the preview. Its stream resolves once per call after it closes.
    pub fn start_preview(&self) -> Result<PreviewStream, CameraError> {
        if self.shared.rules().closed {
            return Err(CameraError::new(ErrorKind::AlreadyResolved));
        }
        Ok(PreviewStream {
            backend: self.shared.backend.start_preview()?,
            closed: Arc::new(Mutex::new(false)),
        })
    }

    /// Starts one recording. An empty mime or a zero fps is an invalid argument and never
    /// reaches the backend; a second recording while one runs resolves in-progress.
    pub fn start_recording(
        &self,
        options: &RecordingOptions,
    ) -> Result<RecordingSession, CameraError> {
        if options.mime == Some("") || options.fps == Some(0) {
            return Err(CameraError::new(ErrorKind::InvalidArgument));
        }
        {
            let mut rules = self.shared.rules();
            if rules.closed {
                return Err(CameraError::new(ErrorKind::AlreadyResolved));
            }
            if rules.recording_active {
                return Err(CameraError::new(ErrorKind::InProgress));
            }
            rules.recording_active = true;
        }
        // The flag turns on before the backend runs, so a racing start sees in-progress; a
        // failed start is the only path that turns it back off.
        match self.shared.backend.start_recording(options) {
            Ok(recording) => Ok(RecordingSession {
                backend: recording,
                resolved: Arc::new(Mutex::new(false)),
                device: Arc::clone(&self.shared),
            }),
            Err(error) => {
                self.shared.rules().recording_active = false;
                Err(error)
            }
        }
    }

    /// Closes the device. The first close wins; every later call on the device resolves
    /// already-resolved.
    pub fn close(&self) -> Result<(), CameraError> {
        {
            let mut rules = self.shared.rules();
            if rules.closed {
                return Err(CameraError::new(ErrorKind::AlreadyResolved));
            }
            rules.closed = true;
        }
        self.shared.backend.close()
    }
}

/// A running preview, from [`CameraDevice::start_preview`].
pub struct PreviewStream {
    backend: Box<dyn PreviewBackend>,
    closed: Arc<Mutex<bool>>,
}

impl PreviewStream {
    /// The next frame, or not-available while none is ready. After close: already-resolved.
    pub fn next_frame(&self) -> Result<Frame, CameraError> {
        if *self.closed.lock().unwrap_or_else(PoisonError::into_inner) {
            return Err(CameraError::new(ErrorKind::AlreadyResolved));
        }
        self.backend.next_frame()
    }

    /// Stops the preview. The first close wins; later calls resolve already-resolved.
    pub fn close(&self) -> Result<(), CameraError> {
        let mut closed = self.closed.lock().unwrap_or_else(PoisonError::into_inner);
        if *closed {
            return Err(CameraError::new(ErrorKind::AlreadyResolved));
        }
        *closed = true;
        drop(closed);
        self.backend.close()
    }
}

/// A running recording, from [`CameraDevice::start_recording`].
///
/// The first of `stop` or `cancel` resolves it — an erroring stop included — and every later
/// one on the same session resolves already-resolved.
pub struct RecordingSession {
    backend: Box<dyn RecordingBackend>,
    resolved: Arc<Mutex<bool>>,
    device: Arc<DeviceShared>,
}

impl RecordingSession {
    /// The orientation the recording holds right now; platforms may change it mid-recording.
    pub fn orientation(&self) -> Orientation {
        self.backend.orientation()
    }

    /// Finishes the recording and returns its bytes. An OS interruption (backgrounding, a
    /// phone call) surfaces here as interrupted — and still resolves the session.
    pub fn stop(&self) -> Result<Recording, CameraError> {
        self.resolve_once()?;
        self.backend.stop()
    }

    /// Abandons the recording; no bytes come back.
    pub fn cancel(&self) -> Result<(), CameraError> {
        self.resolve_once()?;
        self.backend.cancel()
    }

    /// Takes the session's single resolution and frees the device for the next recording.
    /// Called before the backend runs, so no backend sees a session twice.
    fn resolve_once(&self) -> Result<(), CameraError> {
        {
            let mut resolved = self.resolved.lock().unwrap_or_else(PoisonError::into_inner);
            if *resolved {
                return Err(CameraError::new(ErrorKind::AlreadyResolved));
            }
            *resolved = true;
        }
        self.device.rules().recording_active = false;
        Ok(())
    }
}
