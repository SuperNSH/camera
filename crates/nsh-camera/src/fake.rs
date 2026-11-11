//! A backend with scripted answers. Tests drive it, and so can an app running without a
//! camera.

use std::{
    collections::VecDeque,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};

use crate::{
    backend::{Backend, DeviceBackend, PreviewBackend, RecordingBackend},
    error::{CameraError, ErrorKind},
    options::{
        CameraId, CameraInfo, Frame, Orientation, PermissionState, Photo, PhotoOptions, Recording,
        RecordingOptions, Resolution,
    },
};

/// How `request_permission` answers. The deny scripts mirror iOS: one decline, then only the
/// system settings can change it.
enum PermissionScript {
    Grant,
    DenyOnce,
    DenyPermanently,
    Restricted,
}

/// Everything a script can set. The backend and every device it opens share one state, so a
/// test can script while device handles are alive.
struct FakeState {
    permission: PermissionState,
    script: PermissionScript,
    devices: Vec<CameraInfo>,
    next_open_error: Option<CameraError>,
    mic_denied: bool,
    photos: VecDeque<Photo>,
    next_capture_error: Option<CameraError>,
    frames: VecDeque<Frame>,
    orientation: Orientation,
    next_recording_error: Option<CameraError>,
    next_stop_error: Option<CameraError>,
    recording_data: VecDeque<Vec<u8>>,
}

/// A [`Backend`] whose answers a test scripts.
///
/// Every method, scripting included, takes `&self` over `Arc`-shared state, so a test keeps
/// scripting while device, preview and recording handles are alive.
pub struct FakeBackend {
    state: Arc<Mutex<FakeState>>,
}

impl Default for FakeBackend {
    /// Nothing scripted: permission not determined, no devices, every default answer.
    fn default() -> Self {
        Self::new()
    }
}

impl FakeBackend {
    /// A backend nothing is scripted on: `request_permission` grants, `devices` is empty.
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(FakeState {
                permission: PermissionState::NotDetermined,
                script: PermissionScript::Grant,
                devices: Vec::new(),
                next_open_error: None,
                mic_denied: false,
                photos: VecDeque::new(),
                next_capture_error: None,
                frames: VecDeque::new(),
                orientation: Orientation::PortraitUp,
                next_recording_error: None,
                next_stop_error: None,
                recording_data: VecDeque::new(),
            })),
        }
    }

    // Every lock spans one method and never wraps another lock or a backend call, so it
    // cannot poison; the helpers still recover a poisoned guard instead of panicking.
    fn lock(&self) -> MutexGuard<'_, FakeState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// `request_permission` resolves `Ok(Granted)`, and the state reports granted.
    pub fn grant_permission(&self) {
        let mut state = self.lock();
        state.permission = PermissionState::Granted;
        state.script = PermissionScript::Grant;
    }

    /// The first request is declined and turns the state denied; every later request is
    /// permanently denied — the iOS one-shot.
    pub fn deny_permission_once(&self) {
        self.lock().script = PermissionScript::DenyOnce;
    }

    /// Every request is permanently denied: only the system settings could grant it.
    pub fn deny_permission_permanently(&self) {
        let mut state = self.lock();
        state.permission = PermissionState::Denied;
        state.script = PermissionScript::DenyPermanently;
    }

    /// Requests resolve permission-restricted (parental controls); the state reports denied.
    pub fn restrict_permission(&self) {
        let mut state = self.lock();
        state.permission = PermissionState::Denied;
        state.script = PermissionScript::Restricted;
    }

    /// `devices` returns exactly these cameras.
    pub fn with_devices(&self, devices: Vec<CameraInfo>) {
        self.lock().devices = devices;
    }

    /// The next `open_device` on a scripted device resolves this error; one shot.
    pub fn fail_open_with(&self, error: CameraError) {
        self.lock().next_open_error = Some(error);
    }

    /// A recording asking for audio resolves mic-permission-denied, and no recording starts.
    pub fn deny_microphone(&self) {
        self.lock().mic_denied = true;
    }

    /// `capture_photo` returns this photo first (FIFO), before the synthesized default.
    pub fn queue_photo(&self, photo: Photo) {
        self.lock().photos.push_back(photo);
    }

    /// The next `capture_photo` resolves this error, one shot.
    pub fn fail_capture_with(&self, error: CameraError) {
        self.lock().next_capture_error = Some(error);
    }

    /// `next_frame` pops these frames FIFO; an empty queue resolves not-available.
    pub fn queue_frames(&self, frames: Vec<Frame>) {
        self.lock().frames.extend(frames);
    }

    /// The active recording's `orientation` reports this; a recording keeps running through
    /// the change.
    pub fn set_orientation(&self, orientation: Orientation) {
        self.lock().orientation = orientation;
    }

    /// The next `start_recording` resolves this error, one shot — the orientation and format
    /// scripts.
    pub fn fail_recording_with(&self, error: CameraError) {
        self.lock().next_recording_error = Some(error);
    }

    /// The next `stop` resolves interrupted, and that recording counts as resolved; one shot.
    pub fn interrupt_recording(&self) {
        self.lock().next_stop_error = Some(CameraError::new(ErrorKind::Interrupted));
    }

    /// The next `stop` resolves this error, one shot.
    pub fn fail_stop_with(&self, error: CameraError) {
        self.lock().next_stop_error = Some(error);
    }

    /// The next `stop`'s recording carries these bytes.
    pub fn queue_recording_data(&self, data: Vec<u8>) {
        self.lock().recording_data.push_back(data);
    }
}

impl Backend for FakeBackend {
    fn permission(&self) -> Result<PermissionState, CameraError> {
        Ok(self.lock().permission)
    }

    fn request_permission(&self) -> Result<PermissionState, CameraError> {
        let mut state = self.lock();
        match state.script {
            PermissionScript::Grant => {
                state.permission = PermissionState::Granted;
                Ok(PermissionState::Granted)
            }
            PermissionScript::DenyOnce => {
                if state.permission == PermissionState::Denied {
                    Err(CameraError::new(ErrorKind::PermissionPermanentlyDenied))
                } else {
                    state.permission = PermissionState::Denied;
                    Err(CameraError::new(ErrorKind::PermissionDenied))
                }
            }
            PermissionScript::DenyPermanently => {
                Err(CameraError::new(ErrorKind::PermissionPermanentlyDenied))
            }
            PermissionScript::Restricted => Err(CameraError::new(ErrorKind::PermissionRestricted)),
        }
    }

    fn devices(&self) -> Result<Vec<CameraInfo>, CameraError> {
        Ok(self.lock().devices.clone())
    }

    fn open_device(&self, id: &CameraId) -> Result<Box<dyn DeviceBackend>, CameraError> {
        let mut state = self.lock();
        // Membership first, as the TS memory backend: an unknown id leaves the one-shot armed.
        if !state.devices.iter().any(|info| info.id == *id) {
            return Err(CameraError::new(ErrorKind::NotAvailable));
        }
        if let Some(error) = state.next_open_error.take() {
            return Err(error);
        }
        Ok(Box::new(FakeDevice {
            state: Arc::clone(&self.state),
            rules: Arc::new(Mutex::new(DeviceRules {
                closed: false,
                recording_active: false,
            })),
        }))
    }
}

/// The device the fake opens: the exactly-once and one-recording rules, plus the scripted
/// answers it shares with the backend.
pub struct FakeDevice {
    state: Arc<Mutex<FakeState>>,
    rules: Arc<Mutex<DeviceRules>>,
}

/// The flags the device shares with the recordings it starts.
struct DeviceRules {
    closed: bool,
    recording_active: bool,
}

impl FakeDevice {
    fn lock_state(&self) -> MutexGuard<'_, FakeState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn rules(&self) -> MutexGuard<'_, DeviceRules> {
        self.rules.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl DeviceBackend for FakeDevice {
    fn capture_photo(&self, options: &PhotoOptions) -> Result<Photo, CameraError> {
        if self.rules().closed {
            return Err(CameraError::new(ErrorKind::AlreadyResolved));
        }
        let mut state = self.lock_state();
        if let Some(error) = state.next_capture_error.take() {
            return Err(error);
        }
        if let Some(photo) = state.photos.pop_front() {
            return Ok(photo);
        }
        Ok(Photo {
            data: Vec::new(),
            mime: options.mime.unwrap_or("image/jpeg"),
            resolution: options.resolution.clone().unwrap_or(Resolution {
                width: 1920,
                height: 1080,
            }),
            orientation: Orientation::PortraitUp,
        })
    }

    fn start_preview(&self) -> Result<Box<dyn PreviewBackend>, CameraError> {
        if self.rules().closed {
            return Err(CameraError::new(ErrorKind::AlreadyResolved));
        }
        Ok(Box::new(FakePreview {
            state: Arc::clone(&self.state),
            closed: Arc::new(Mutex::new(false)),
        }))
    }

    fn start_recording(
        &self,
        options: &RecordingOptions,
    ) -> Result<Box<dyn RecordingBackend>, CameraError> {
        {
            let mut rules = self.rules();
            if rules.closed {
                return Err(CameraError::new(ErrorKind::AlreadyResolved));
            }
            if rules.recording_active {
                return Err(CameraError::new(ErrorKind::InProgress));
            }
            rules.recording_active = true;
        }
        // The microphone is checked before any start script, as the platforms check it first.
        let failed = {
            let mut state = self.lock_state();
            if options.audio && state.mic_denied {
                Some(CameraError::new(ErrorKind::MicPermissionDenied))
            } else {
                state.next_recording_error.take()
            }
        };
        if let Some(error) = failed {
            self.rules().recording_active = false;
            return Err(error);
        }
        self.lock_state().orientation = options.orientation.unwrap_or(Orientation::PortraitUp);
        Ok(Box::new(FakeRecording {
            state: Arc::clone(&self.state),
            rules: Arc::clone(&self.rules),
            resolved: Mutex::new(false),
            resolution: options.resolution.clone().unwrap_or(Resolution {
                width: 1920,
                height: 1080,
            }),
            mime: options.mime.unwrap_or("video/mp4"),
        }))
    }

    fn close(&self) -> Result<(), CameraError> {
        {
            let mut rules = self.rules();
            if rules.closed {
                return Err(CameraError::new(ErrorKind::AlreadyResolved));
            }
            rules.closed = true;
        }
        Ok(())
    }
}

/// The preview the fake runs: the queued frames, FIFO, until it closes.
pub struct FakePreview {
    state: Arc<Mutex<FakeState>>,
    closed: Arc<Mutex<bool>>,
}

impl FakePreview {
    fn lock_state(&self) -> MutexGuard<'_, FakeState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl PreviewBackend for FakePreview {
    fn next_frame(&self) -> Result<Frame, CameraError> {
        if *self.closed.lock().unwrap_or_else(PoisonError::into_inner) {
            return Err(CameraError::new(ErrorKind::AlreadyResolved));
        }
        self.lock_state()
            .frames
            .pop_front()
            .ok_or_else(|| CameraError::new(ErrorKind::NotAvailable))
    }

    fn close(&self) -> Result<(), CameraError> {
        let mut closed = self.closed.lock().unwrap_or_else(PoisonError::into_inner);
        if *closed {
            return Err(CameraError::new(ErrorKind::AlreadyResolved));
        }
        *closed = true;
        drop(closed);
        Ok(())
    }
}

/// The recording the fake runs: `stop` synthesizes a recording from the start options with
/// the queued bytes, and one script decides how the single resolution goes.
pub struct FakeRecording {
    state: Arc<Mutex<FakeState>>,
    rules: Arc<Mutex<DeviceRules>>,
    resolved: Mutex<bool>,
    resolution: Resolution,
    mime: &'static str,
}

impl FakeRecording {
    fn lock_state(&self) -> MutexGuard<'_, FakeState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Takes the recording's single resolution and frees the device for the next one. Called
    /// before the scripts run, so a stop script never fires twice.
    fn resolve_once(&self) -> Result<(), CameraError> {
        {
            let mut resolved = self.resolved.lock().unwrap_or_else(PoisonError::into_inner);
            if *resolved {
                return Err(CameraError::new(ErrorKind::AlreadyResolved));
            }
            *resolved = true;
        }
        self.rules().recording_active = false;
        Ok(())
    }
}

impl RecordingBackend for FakeRecording {
    fn orientation(&self) -> Orientation {
        self.lock_state().orientation
    }

    fn stop(&self) -> Result<Recording, CameraError> {
        self.resolve_once()?;
        let mut state = self.lock_state();
        if let Some(error) = state.next_stop_error.take() {
            return Err(error);
        }
        let data = state.recording_data.pop_front().unwrap_or_default();
        Ok(Recording {
            data,
            mime: self.mime,
            resolution: self.resolution.clone(),
        })
    }

    fn cancel(&self) -> Result<(), CameraError> {
        self.resolve_once()?;
        Ok(())
    }
}
