//! Apple bridge: AVFoundation behind a link seam, wired through objc2 or a Swift bridge when a
//! native backend lands (docs/brief.md). The iOS simulator lists no AVFoundation cameras, so a
//! missing device reports `NotAvailable`. iOS asks for camera permission exactly once:
//! `DeclinedPermanently` means only Settings can change it, and `Restricted` is the
//! parental-controls state.

use std::sync::Arc;

#[cfg(test)]
use std::sync::{Mutex, MutexGuard, PoisonError};

use crate::{
    backend::{Backend, DeviceBackend, PreviewBackend, RecordingBackend},
    error::{CameraError, ErrorKind},
    options::{
        CameraId, CameraInfo, Frame, Orientation, PermissionState, Photo, PhotoOptions, Recording,
        RecordingOptions,
    },
};

/// The AVFoundation calls this bridge makes once a native backend lands.
pub trait AvFoundationLink: Send + Sync {
    /// What the camera permission is right now; the probe never asks.
    fn permission_probe(&self) -> LinkPermission;
    fn request_permission(&self) -> LinkPermission;
    /// Consulted when a recording asks for audio.
    fn mic_permission_probe(&self) -> LinkPermission;
    fn device_list(&self) -> Result<Vec<CameraInfo>, LinkFailure>;
    fn open_device(&self, id: &CameraId) -> Result<(), LinkFailure>;
    fn capture_photo(&self, options: &PhotoOptions) -> Result<Photo, LinkFailure>;
    fn start_preview(&self) -> Result<(), LinkFailure>;
    fn next_frame(&self) -> Result<Frame, LinkFailure>;
    fn start_recording(&self, options: &RecordingOptions) -> Result<(), LinkFailure>;
    fn recording_orientation(&self) -> Orientation;
    fn stop_recording(&self) -> Result<Recording, LinkFailure>;
    fn cancel_recording(&self) -> Result<(), LinkFailure>;
    fn close_device(&self) -> Result<(), LinkFailure>;
}

/// What a permission probe or permission request came back with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LinkPermission {
    Granted,
    DeclinedOnce,
    DeclinedPermanently,
    Restricted,
    Unavailable,
}

/// How a native call failed; `Unavailable` is the unwired state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LinkFailure {
    Busy,
    Missing,
    AudioPermission,
    Format,
    Orientation,
    Interrupted,
    Unavailable,
}

/// The link before any native wiring: every call is unavailable.
pub struct NullLink;

impl AvFoundationLink for NullLink {
    fn permission_probe(&self) -> LinkPermission {
        LinkPermission::Unavailable
    }

    fn request_permission(&self) -> LinkPermission {
        LinkPermission::Unavailable
    }

    fn mic_permission_probe(&self) -> LinkPermission {
        LinkPermission::Unavailable
    }

    fn device_list(&self) -> Result<Vec<CameraInfo>, LinkFailure> {
        Err(LinkFailure::Unavailable)
    }

    fn open_device(&self, _id: &CameraId) -> Result<(), LinkFailure> {
        Err(LinkFailure::Unavailable)
    }

    fn capture_photo(&self, _options: &PhotoOptions) -> Result<Photo, LinkFailure> {
        Err(LinkFailure::Unavailable)
    }

    fn start_preview(&self) -> Result<(), LinkFailure> {
        Err(LinkFailure::Unavailable)
    }

    fn next_frame(&self) -> Result<Frame, LinkFailure> {
        Err(LinkFailure::Unavailable)
    }

    fn start_recording(&self, _options: &RecordingOptions) -> Result<(), LinkFailure> {
        Err(LinkFailure::Unavailable)
    }

    fn recording_orientation(&self) -> Orientation {
        Orientation::PortraitUp
    }

    fn stop_recording(&self) -> Result<Recording, LinkFailure> {
        Err(LinkFailure::Unavailable)
    }

    fn cancel_recording(&self) -> Result<(), LinkFailure> {
        Err(LinkFailure::Unavailable)
    }

    fn close_device(&self) -> Result<(), LinkFailure> {
        Err(LinkFailure::Unavailable)
    }
}

// Scripted links are test tooling: only the in-file tests construct them, so cfg(test)
// keeps them out of the compiled library without dead-code warnings.
#[cfg(test)]
pub struct ScriptedLink {
    state: Arc<Mutex<ScriptedState>>,
}

#[cfg(test)]
struct ScriptedState {
    permission_probe: LinkPermission,
    request_permission: LinkPermission,
    mic_permission: LinkPermission,
    device_list: Result<Vec<CameraInfo>, LinkFailure>,
    open_device: Result<(), LinkFailure>,
    capture_photo: Option<Result<Photo, LinkFailure>>,
    start_preview: Result<(), LinkFailure>,
    next_frame: Option<Result<Frame, LinkFailure>>,
    start_recording: Result<(), LinkFailure>,
    recording_orientation: Orientation,
    stop_recording: Option<Result<Recording, LinkFailure>>,
    cancel_recording: Result<(), LinkFailure>,
    close_device: Result<(), LinkFailure>,
}

#[cfg(test)]
impl ScriptedState {
    fn new() -> Self {
        Self {
            permission_probe: LinkPermission::Unavailable,
            request_permission: LinkPermission::Unavailable,
            mic_permission: LinkPermission::Unavailable,
            device_list: Err(LinkFailure::Unavailable),
            open_device: Err(LinkFailure::Unavailable),
            capture_photo: None,
            start_preview: Err(LinkFailure::Unavailable),
            next_frame: None,
            start_recording: Err(LinkFailure::Unavailable),
            recording_orientation: Orientation::PortraitUp,
            stop_recording: None,
            cancel_recording: Err(LinkFailure::Unavailable),
            close_device: Err(LinkFailure::Unavailable),
        }
    }
}

#[cfg(test)]
impl Default for ScriptedLink {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
impl ScriptedLink {
    /// A link that answers unavailable until a test scripts an answer.
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(ScriptedState::new())),
        }
    }

    // Locks are held for one statement only, never across another lock, so they cannot poison.
    fn lock(&self) -> MutexGuard<'_, ScriptedState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Sets what `permission_probe` answers.
    pub fn set_permission_probe(&self, permission: LinkPermission) {
        self.lock().permission_probe = permission;
    }

    /// Sets what `request_permission` answers.
    pub fn set_request_permission(&self, permission: LinkPermission) {
        self.lock().request_permission = permission;
    }

    /// Sets what `mic_permission_probe` answers.
    pub fn set_mic_permission(&self, permission: LinkPermission) {
        self.lock().mic_permission = permission;
    }

    /// Makes `device_list` answer `Ok` with these devices.
    pub fn set_device_list(&self, devices: Vec<CameraInfo>) {
        self.lock().device_list = Ok(devices);
    }

    /// Makes `device_list` answer `Err` with this failure.
    pub fn fail_device_list(&self, failure: LinkFailure) {
        self.lock().device_list = Err(failure);
    }

    /// Makes `open_device` answer `Ok`.
    pub fn set_open_device(&self) {
        self.lock().open_device = Ok(());
    }

    /// Makes `open_device` answer `Err` with this failure.
    pub fn fail_open_device(&self, failure: LinkFailure) {
        self.lock().open_device = Err(failure);
    }

    /// Makes `capture_photo` answer `Ok` with this photo.
    pub fn set_capture_photo(&self, photo: Photo) {
        self.lock().capture_photo = Some(Ok(photo));
    }

    /// Makes `capture_photo` answer `Err` with this failure.
    pub fn fail_capture_photo(&self, failure: LinkFailure) {
        self.lock().capture_photo = Some(Err(failure));
    }

    /// Makes `start_preview` answer `Err` with this failure.
    pub fn fail_start_preview(&self, failure: LinkFailure) {
        self.lock().start_preview = Err(failure);
    }

    /// Makes `next_frame` answer `Ok` with this frame.
    pub fn set_next_frame(&self, frame: Frame) {
        self.lock().next_frame = Some(Ok(frame));
    }

    /// Makes `next_frame` answer `Err` with this failure.
    pub fn fail_next_frame(&self, failure: LinkFailure) {
        self.lock().next_frame = Some(Err(failure));
    }

    /// Makes `start_recording` answer `Err` with this failure.
    pub fn fail_start_recording(&self, failure: LinkFailure) {
        self.lock().start_recording = Err(failure);
    }

    /// Sets what `recording_orientation` answers.
    pub fn set_recording_orientation(&self, orientation: Orientation) {
        self.lock().recording_orientation = orientation;
    }

    /// Makes `stop_recording` answer `Ok` with this recording.
    pub fn set_stop_recording(&self, recording: Recording) {
        self.lock().stop_recording = Some(Ok(recording));
    }

    /// Makes `stop_recording` answer `Err` with this failure.
    pub fn fail_stop_recording(&self, failure: LinkFailure) {
        self.lock().stop_recording = Some(Err(failure));
    }

    /// Makes `cancel_recording` answer `Ok`.
    pub fn set_cancel_recording(&self) {
        self.lock().cancel_recording = Ok(());
    }
}

#[cfg(test)]
impl AvFoundationLink for ScriptedLink {
    fn permission_probe(&self) -> LinkPermission {
        self.lock().permission_probe
    }

    fn request_permission(&self) -> LinkPermission {
        self.lock().request_permission
    }

    fn mic_permission_probe(&self) -> LinkPermission {
        self.lock().mic_permission
    }

    fn device_list(&self) -> Result<Vec<CameraInfo>, LinkFailure> {
        self.lock().device_list.clone()
    }

    fn open_device(&self, _id: &CameraId) -> Result<(), LinkFailure> {
        self.lock().open_device
    }

    fn capture_photo(&self, _options: &PhotoOptions) -> Result<Photo, LinkFailure> {
        self.lock()
            .capture_photo
            .clone()
            .unwrap_or_else(|| Err(LinkFailure::Unavailable))
    }

    fn start_preview(&self) -> Result<(), LinkFailure> {
        self.lock().start_preview
    }

    fn next_frame(&self) -> Result<Frame, LinkFailure> {
        self.lock()
            .next_frame
            .clone()
            .unwrap_or_else(|| Err(LinkFailure::Unavailable))
    }

    fn start_recording(&self, _options: &RecordingOptions) -> Result<(), LinkFailure> {
        self.lock().start_recording
    }

    fn recording_orientation(&self) -> Orientation {
        self.lock().recording_orientation
    }

    fn stop_recording(&self) -> Result<Recording, LinkFailure> {
        self.lock()
            .stop_recording
            .clone()
            .unwrap_or_else(|| Err(LinkFailure::Unavailable))
    }

    fn cancel_recording(&self) -> Result<(), LinkFailure> {
        self.lock().cancel_recording
    }

    fn close_device(&self) -> Result<(), LinkFailure> {
        self.lock().close_device
    }
}

/// The Apple [`Backend`]: AVFoundation answers arrive through `L`, an [`AvFoundationLink`].
pub struct AppleBackend<L: AvFoundationLink> {
    link: Arc<L>,
}

impl AppleBackend<NullLink> {
    /// A backend over the null link: every call resolves `ERR_CAMERA_NOT_AVAILABLE`.
    pub fn new() -> Self {
        Self {
            link: Arc::new(NullLink),
        }
    }
}

impl Default for AppleBackend<NullLink> {
    fn default() -> Self {
        Self::new()
    }
}

impl<L: AvFoundationLink> AppleBackend<L> {
    /// A backend over an existing link, shared with the devices and sessions it returns.
    pub fn with_link(link: Arc<L>) -> Self {
        Self { link }
    }
}

impl<L: AvFoundationLink + 'static> Backend for AppleBackend<L> {
    fn permission(&self) -> Result<PermissionState, CameraError> {
        match self.link.permission_probe() {
            LinkPermission::Granted => Ok(PermissionState::Granted),
            LinkPermission::DeclinedOnce
            | LinkPermission::DeclinedPermanently
            | LinkPermission::Restricted => Ok(PermissionState::Denied),
            LinkPermission::Unavailable => Err(CameraError::new(ErrorKind::NotAvailable)),
        }
    }

    fn request_permission(&self) -> Result<PermissionState, CameraError> {
        match self.link.request_permission() {
            LinkPermission::Granted => Ok(PermissionState::Granted),
            LinkPermission::DeclinedOnce => Err(CameraError::new(ErrorKind::PermissionDenied)),
            LinkPermission::DeclinedPermanently => {
                Err(CameraError::new(ErrorKind::PermissionPermanentlyDenied))
            }
            LinkPermission::Restricted => Err(CameraError::new(ErrorKind::PermissionRestricted)),
            LinkPermission::Unavailable => Err(CameraError::new(ErrorKind::NotAvailable)),
        }
    }

    fn devices(&self) -> Result<Vec<CameraInfo>, CameraError> {
        match self.link.device_list() {
            Ok(list) => Ok(list),
            Err(LinkFailure::Busy) => Err(CameraError::new(ErrorKind::DeviceBusy)),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            // A failure this call cannot produce means a broken link, not an absent camera.
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }

    fn open_device(&self, id: &CameraId) -> Result<Box<dyn DeviceBackend>, CameraError> {
        match self.link.open_device(id) {
            Ok(()) => Ok(Box::new(AppleDevice {
                link: Arc::clone(&self.link),
            })),
            Err(LinkFailure::Busy) => Err(CameraError::new(ErrorKind::DeviceBusy)),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }
}

/// An open AVFoundation capture device, produced by [`AppleBackend`].
pub struct AppleDevice<L: AvFoundationLink> {
    link: Arc<L>,
}

impl<L: AvFoundationLink + 'static> DeviceBackend for AppleDevice<L> {
    fn capture_photo(&self, options: &PhotoOptions) -> Result<Photo, CameraError> {
        match self.link.capture_photo(options) {
            Ok(photo) => Ok(photo),
            Err(LinkFailure::Format) => Err(CameraError::new(ErrorKind::FormatUnsupported)),
            Err(LinkFailure::Busy) => Err(CameraError::new(ErrorKind::DeviceBusy)),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }

    fn start_preview(&self) -> Result<Box<dyn PreviewBackend>, CameraError> {
        match self.link.start_preview() {
            Ok(()) => Ok(Box::new(ApplePreview {
                link: Arc::clone(&self.link),
            })),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }

    fn start_recording(
        &self,
        options: &RecordingOptions,
    ) -> Result<Box<dyn RecordingBackend>, CameraError> {
        if options.audio {
            match self.link.mic_permission_probe() {
                LinkPermission::Granted => {}
                LinkPermission::DeclinedOnce
                | LinkPermission::DeclinedPermanently
                | LinkPermission::Restricted => {
                    return Err(CameraError::new(ErrorKind::MicPermissionDenied));
                }
                LinkPermission::Unavailable => {
                    return Err(CameraError::new(ErrorKind::NotAvailable));
                }
            }
        }
        match self.link.start_recording(options) {
            Ok(()) => Ok(Box::new(AppleRecording {
                link: Arc::clone(&self.link),
            })),
            Err(LinkFailure::AudioPermission) => {
                Err(CameraError::new(ErrorKind::MicPermissionDenied))
            }
            Err(LinkFailure::Format) => Err(CameraError::new(ErrorKind::FormatUnsupported)),
            Err(LinkFailure::Orientation) => {
                Err(CameraError::new(ErrorKind::OrientationUnsupported))
            }
            Err(LinkFailure::Busy) => Err(CameraError::new(ErrorKind::DeviceBusy)),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }

    fn close(&self) -> Result<(), CameraError> {
        match self.link.close_device() {
            Ok(()) => Ok(()),
            Err(LinkFailure::Busy) => Err(CameraError::new(ErrorKind::DeviceBusy)),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }
}

/// A running AVFoundation preview, produced by [`AppleDevice`].
pub struct ApplePreview<L: AvFoundationLink> {
    link: Arc<L>,
}

impl<L: AvFoundationLink> PreviewBackend for ApplePreview<L> {
    fn next_frame(&self) -> Result<Frame, CameraError> {
        match self.link.next_frame() {
            Ok(frame) => Ok(frame),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }

    fn close(&self) -> Result<(), CameraError> {
        // The link has no preview teardown call; dropping the stream is the whole close.
        Ok(())
    }
}

/// A running AVFoundation recording, produced by [`AppleDevice`].
pub struct AppleRecording<L: AvFoundationLink> {
    link: Arc<L>,
}

impl<L: AvFoundationLink> RecordingBackend for AppleRecording<L> {
    fn orientation(&self) -> Orientation {
        self.link.recording_orientation()
    }

    fn stop(&self) -> Result<Recording, CameraError> {
        match self.link.stop_recording() {
            Ok(recording) => Ok(recording),
            Err(LinkFailure::Interrupted) => Err(CameraError::new(ErrorKind::Interrupted)),
            Err(LinkFailure::Unavailable) => Err(CameraError::new(ErrorKind::NotAvailable)),
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }

    fn cancel(&self) -> Result<(), CameraError> {
        match self.link.cancel_recording() {
            Ok(()) => Ok(()),
            Err(LinkFailure::Unavailable) => Err(CameraError::new(ErrorKind::NotAvailable)),
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Camera, Resolution};

    fn camera_over(link: &Arc<ScriptedLink>) -> Camera {
        Camera::with_backend(Arc::new(AppleBackend::with_link(Arc::clone(link))))
    }

    fn back_camera_id() -> CameraId {
        CameraId("back".into())
    }

    fn recording_options(audio: bool, orientation: Option<Orientation>) -> RecordingOptions {
        RecordingOptions {
            resolution: None,
            fps: None,
            mime: None,
            audio,
            orientation,
        }
    }

    #[test]
    fn null_link_resolves_not_available_everywhere() {
        let camera = Camera::with_backend(Arc::new(AppleBackend::new()));
        let probe = camera.permission().err().expect("probe fails");
        assert_eq!(probe.kind(), ErrorKind::NotAvailable);
        let request = camera.request_permission().err().expect("request fails");
        assert_eq!(request.kind(), ErrorKind::NotAvailable);
        let devices = camera.devices().err().expect("list fails");
        assert_eq!(devices.kind(), ErrorKind::NotAvailable);
        let open = camera.open(&back_camera_id()).err().expect("open fails");
        assert_eq!(open.kind(), ErrorKind::NotAvailable);
    }

    #[test]
    fn scripted_permission_probe_maps_per_table() {
        let denied = [
            LinkPermission::DeclinedOnce,
            LinkPermission::DeclinedPermanently,
            LinkPermission::Restricted,
        ];
        for scripted in denied {
            let link = Arc::new(ScriptedLink::new());
            link.set_permission_probe(scripted);
            let camera = camera_over(&link);
            let state = camera.permission().expect("state resolves");
            assert_eq!(state, PermissionState::Denied);
        }
        let link = Arc::new(ScriptedLink::new());
        link.set_permission_probe(LinkPermission::Granted);
        let camera = camera_over(&link);
        let state = camera.permission().expect("granted");
        assert_eq!(state, PermissionState::Granted);
    }

    #[test]
    fn scripted_request_permission_maps_per_table() {
        let cases = [
            (LinkPermission::Granted, Ok(PermissionState::Granted)),
            (
                LinkPermission::DeclinedOnce,
                Err(ErrorKind::PermissionDenied),
            ),
            (
                LinkPermission::DeclinedPermanently,
                Err(ErrorKind::PermissionPermanentlyDenied),
            ),
            (
                LinkPermission::Restricted,
                Err(ErrorKind::PermissionRestricted),
            ),
            (LinkPermission::Unavailable, Err(ErrorKind::NotAvailable)),
        ];
        for (scripted, expected) in cases {
            let link = Arc::new(ScriptedLink::new());
            link.set_request_permission(scripted);
            let camera = camera_over(&link);
            let answer = camera.request_permission();
            match expected {
                Ok(state) => assert_eq!(answer.expect("granted"), state),
                Err(kind) => assert_eq!(answer.err().expect("denied").kind(), kind),
            }
        }
    }

    #[test]
    fn mic_probe_rides_only_on_audio_recordings() {
        let link = Arc::new(ScriptedLink::new());
        link.set_open_device();
        link.set_mic_permission(LinkPermission::DeclinedOnce);
        link.fail_start_recording(LinkFailure::Format);
        let camera = camera_over(&link);
        let device = camera.open(&back_camera_id()).expect("device opens");
        let err = device
            .start_recording(&recording_options(true, None))
            .err()
            .expect("audio recording refused");
        assert_eq!(err.kind(), ErrorKind::MicPermissionDenied);
        // With audio off the mic is never asked, so the link failure is what surfaces.
        let err = device
            .start_recording(&recording_options(false, None))
            .err()
            .expect("silent path reaches the link");
        assert_eq!(err.kind(), ErrorKind::FormatUnsupported);
    }

    #[test]
    fn start_recording_audio_permission_maps_to_mic_permission_denied() {
        let link = Arc::new(ScriptedLink::new());
        link.set_open_device();
        link.set_mic_permission(LinkPermission::Granted);
        link.fail_start_recording(LinkFailure::AudioPermission);
        let camera = camera_over(&link);
        let device = camera.open(&back_camera_id()).expect("device opens");
        let err = device
            .start_recording(&recording_options(true, None))
            .err()
            .expect("link reports audio permission");
        assert_eq!(err.kind(), ErrorKind::MicPermissionDenied);
    }

    #[test]
    fn device_list_failures_map_per_table() {
        let link = Arc::new(ScriptedLink::new());
        link.fail_device_list(LinkFailure::Busy);
        let camera = camera_over(&link);
        let busy = camera.devices().err().expect("busy fails");
        assert_eq!(busy.kind(), ErrorKind::DeviceBusy);
        link.fail_device_list(LinkFailure::Missing);
        let missing = camera.devices().err().expect("missing fails");
        assert_eq!(missing.kind(), ErrorKind::NotAvailable);
        link.set_device_list(Vec::new());
        let devices = camera.devices().expect("empty list resolves");
        assert!(devices.is_empty());
    }

    #[test]
    fn open_device_failures_map_per_table() {
        let link = Arc::new(ScriptedLink::new());
        link.fail_open_device(LinkFailure::Busy);
        let camera = camera_over(&link);
        let busy = camera.open(&back_camera_id()).err().expect("busy fails");
        assert_eq!(busy.kind(), ErrorKind::DeviceBusy);
        link.fail_open_device(LinkFailure::Missing);
        let missing = camera.open(&back_camera_id()).err().expect("missing fails");
        assert_eq!(missing.kind(), ErrorKind::NotAvailable);
    }

    #[test]
    fn scripted_open_then_capture_format_maps_to_format_unsupported() {
        let link = Arc::new(ScriptedLink::new());
        link.set_open_device();
        link.fail_capture_photo(LinkFailure::Format);
        let camera = camera_over(&link);
        let device = camera.open(&back_camera_id()).expect("device opens");
        let options = PhotoOptions {
            resolution: None,
            mime: None,
        };
        let err = device
            .capture_photo(&options)
            .err()
            .expect("format refused");
        assert_eq!(err.kind(), ErrorKind::FormatUnsupported);
    }

    #[test]
    fn scripted_capture_returns_the_scripted_photo() {
        let link = Arc::new(ScriptedLink::new());
        link.set_open_device();
        link.set_capture_photo(Photo {
            data: vec![7, 7],
            mime: "image/heif",
            resolution: Resolution {
                width: 1280,
                height: 720,
            },
            orientation: Orientation::PortraitDown,
        });
        let camera = camera_over(&link);
        let device = camera.open(&back_camera_id()).expect("device opens");
        let options = PhotoOptions {
            resolution: None,
            mime: None,
        };
        let photo = device.capture_photo(&options).expect("photo resolves");
        assert_eq!(photo.data, vec![7, 7]);
        assert_eq!(photo.mime, "image/heif");
        assert_eq!(photo.orientation, Orientation::PortraitDown);
    }

    #[test]
    fn start_recording_orientation_maps_to_orientation_unsupported() {
        let link = Arc::new(ScriptedLink::new());
        link.set_open_device();
        link.fail_start_recording(LinkFailure::Orientation);
        let camera = camera_over(&link);
        let device = camera.open(&back_camera_id()).expect("device opens");
        let err = device
            .start_recording(&recording_options(false, Some(Orientation::LandscapeLeft)))
            .err()
            .expect("orientation refused");
        assert_eq!(err.kind(), ErrorKind::OrientationUnsupported);
    }

    #[test]
    fn stop_interrupted_maps_to_interrupted() {
        let link = Arc::new(ScriptedLink::new());
        link.fail_stop_recording(LinkFailure::Interrupted);
        // start_recording cannot answer Ok on a scripted link, so the session is built directly.
        let session = AppleRecording {
            link: Arc::clone(&link),
        };
        let err = session.stop().err().expect("interrupted");
        assert_eq!(err.kind(), ErrorKind::Interrupted);
    }

    #[test]
    fn scripted_stop_returns_the_recording_and_reports_orientation() {
        let link = Arc::new(ScriptedLink::new());
        link.set_recording_orientation(Orientation::LandscapeRight);
        link.set_stop_recording(Recording {
            data: vec![1, 2, 3],
            mime: "video/mp4",
            resolution: Resolution {
                width: 640,
                height: 480,
            },
        });
        let session = AppleRecording {
            link: Arc::clone(&link),
        };
        assert_eq!(session.orientation(), Orientation::LandscapeRight);
        let recording = session.stop().expect("stop resolves");
        assert_eq!(recording.data, vec![1, 2, 3]);
        assert_eq!(recording.mime, "video/mp4");
        assert_eq!(recording.resolution.width, 640);
    }

    #[test]
    fn scripted_cancel_resolves_ok() {
        let link = Arc::new(ScriptedLink::new());
        link.set_cancel_recording();
        let session = AppleRecording {
            link: Arc::clone(&link),
        };
        session.cancel().expect("cancel resolves");
    }

    #[test]
    fn preview_start_failure_maps_to_not_available() {
        let link = Arc::new(ScriptedLink::new());
        link.set_open_device();
        link.fail_start_preview(LinkFailure::Missing);
        let camera = camera_over(&link);
        let device = camera.open(&back_camera_id()).expect("device opens");
        let err = device.start_preview().err().expect("preview refused");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);
    }

    #[test]
    fn preview_frames_resolve_then_run_out_to_not_available() {
        let link = Arc::new(ScriptedLink::new());
        link.set_next_frame(Frame {
            data: vec![9],
            resolution: Resolution {
                width: 320,
                height: 240,
            },
            orientation: Orientation::PortraitUp,
        });
        // start_preview cannot answer Ok on a scripted link, so the stream is built directly.
        let preview = ApplePreview {
            link: Arc::clone(&link),
        };
        let frame = preview.next_frame().expect("frame resolves");
        assert_eq!(frame.data, vec![9]);
        link.fail_next_frame(LinkFailure::Missing);
        let err = preview.next_frame().err().expect("frames run out");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);
    }

    #[test]
    fn invalid_arguments_never_reach_the_link() {
        let link = Arc::new(ScriptedLink::new());
        link.set_open_device();
        link.fail_capture_photo(LinkFailure::Format);
        let camera = camera_over(&link);
        let empty_id = camera
            .open(&CameraId(String::new()))
            .err()
            .expect("empty id refused");
        assert_eq!(empty_id.kind(), ErrorKind::InvalidArgument);
        let device = camera.open(&back_camera_id()).expect("valid id opens");
        let empty_mime = PhotoOptions {
            resolution: None,
            mime: Some(""),
        };
        let err = device
            .capture_photo(&empty_mime)
            .err()
            .expect("empty mime refused");
        assert_eq!(err.kind(), ErrorKind::InvalidArgument);
        // Had the invalid capture reached the link, the scripted Format failure would show.
        let valid = PhotoOptions {
            resolution: None,
            mime: Some("image/jpeg"),
        };
        let err = device.capture_photo(&valid).err().expect("format refused");
        assert_eq!(err.kind(), ErrorKind::FormatUnsupported);
    }
}
