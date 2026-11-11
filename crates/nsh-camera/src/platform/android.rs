//! CameraX through a future JNI link (docs/brief.md). A camera held by another app maps to
//! Busy (ERR_CAMERA_DEVICE_BUSY); lifecycle interruptions when the app is backgrounded surface
//! as Interrupted at stop.

use std::sync::Arc;

#[cfg(test)]
use std::sync::{Mutex, MutexGuard, PoisonError};

use crate::backend::{Backend, DeviceBackend, PreviewBackend, RecordingBackend};
use crate::error::{CameraError, ErrorKind};
use crate::options::{
    CameraId, CameraInfo, Frame, Orientation, PermissionState, Photo, PhotoOptions, Recording,
    RecordingOptions,
};

/// The native CameraX calls this bridge makes once a JNI backend lands.
pub trait CameraXLink: Send + Sync {
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

/// What a link probe or request reports for a permission.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LinkPermission {
    Granted,
    DeclinedOnce,
    DeclinedPermanently,
    Restricted,
    Unavailable,
}

/// How a link call fails; bridge methods map these onto camera error kinds.
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

/// The unwired link: every call resolves Unavailable, so no native code runs.
pub struct NullLink;

impl CameraXLink for NullLink {
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

/// An in-memory link: each call resolves the last armed script; unset resolves Unavailable.
// Scripted links are test tooling; only the in-file tests construct them, so cfg(test)
// keeps them out of the lib target, where they would be dead code.
#[cfg(test)]
pub struct ScriptedLink {
    state: Arc<Mutex<ScriptedState>>,
}

#[cfg(test)]
#[derive(Default)]
struct ScriptedState {
    permission_probe: Option<LinkPermission>,
    request_permission: Option<LinkPermission>,
    mic_permission: Option<LinkPermission>,
    device_list: Option<Result<Vec<CameraInfo>, LinkFailure>>,
    open_device: Option<Result<(), LinkFailure>>,
    capture_photo: Option<Result<Photo, LinkFailure>>,
    start_preview: Option<Result<(), LinkFailure>>,
    next_frame: Option<Result<Frame, LinkFailure>>,
    start_recording: Option<Result<(), LinkFailure>>,
    recording_orientation: Option<Orientation>,
    stop_recording: Option<Result<Recording, LinkFailure>>,
    cancel_recording: Option<Result<(), LinkFailure>>,
    close_device: Option<Result<(), LinkFailure>>,
}

#[cfg(test)]
impl ScriptedLink {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(ScriptedState::default())),
        }
    }

    // Every lock is short-lived inside one method and never held across another lock,
    // so poisoning cannot occur; the guard is recovered regardless.
    fn lock(&self) -> MutexGuard<'_, ScriptedState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn set_permission_probe(&self, permission: LinkPermission) {
        self.lock().permission_probe = Some(permission);
    }

    pub fn set_request_permission(&self, permission: LinkPermission) {
        self.lock().request_permission = Some(permission);
    }

    pub fn set_mic_permission(&self, permission: LinkPermission) {
        self.lock().mic_permission = Some(permission);
    }

    pub fn set_device_list(&self, devices: Vec<CameraInfo>) {
        self.lock().device_list = Some(Ok(devices));
    }

    pub fn fail_device_list(&self, failure: LinkFailure) {
        self.lock().device_list = Some(Err(failure));
    }

    pub fn set_open_device(&self) {
        self.lock().open_device = Some(Ok(()));
    }

    pub fn fail_open_device(&self, failure: LinkFailure) {
        self.lock().open_device = Some(Err(failure));
    }

    pub fn set_capture_photo(&self, photo: Photo) {
        self.lock().capture_photo = Some(Ok(photo));
    }

    pub fn fail_capture_photo(&self, failure: LinkFailure) {
        self.lock().capture_photo = Some(Err(failure));
    }

    pub fn fail_start_preview(&self, failure: LinkFailure) {
        self.lock().start_preview = Some(Err(failure));
    }

    pub fn set_next_frame(&self, frame: Frame) {
        self.lock().next_frame = Some(Ok(frame));
    }

    pub fn fail_next_frame(&self, failure: LinkFailure) {
        self.lock().next_frame = Some(Err(failure));
    }

    pub fn fail_start_recording(&self, failure: LinkFailure) {
        self.lock().start_recording = Some(Err(failure));
    }

    pub fn set_recording_orientation(&self, orientation: Orientation) {
        self.lock().recording_orientation = Some(orientation);
    }

    pub fn set_stop_recording(&self, recording: Recording) {
        self.lock().stop_recording = Some(Ok(recording));
    }

    pub fn fail_stop_recording(&self, failure: LinkFailure) {
        self.lock().stop_recording = Some(Err(failure));
    }

    pub fn set_cancel_recording(&self) {
        self.lock().cancel_recording = Some(Ok(()));
    }
}

#[cfg(test)]
impl Default for ScriptedLink {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
impl CameraXLink for ScriptedLink {
    fn permission_probe(&self) -> LinkPermission {
        self.lock()
            .permission_probe
            .unwrap_or(LinkPermission::Unavailable)
    }

    fn request_permission(&self) -> LinkPermission {
        self.lock()
            .request_permission
            .unwrap_or(LinkPermission::Unavailable)
    }

    fn mic_permission_probe(&self) -> LinkPermission {
        self.lock()
            .mic_permission
            .unwrap_or(LinkPermission::Unavailable)
    }

    fn device_list(&self) -> Result<Vec<CameraInfo>, LinkFailure> {
        self.lock()
            .device_list
            .clone()
            .unwrap_or(Err(LinkFailure::Unavailable))
    }

    fn open_device(&self, _id: &CameraId) -> Result<(), LinkFailure> {
        self.lock()
            .open_device
            .unwrap_or(Err(LinkFailure::Unavailable))
    }

    fn capture_photo(&self, _options: &PhotoOptions) -> Result<Photo, LinkFailure> {
        self.lock()
            .capture_photo
            .clone()
            .unwrap_or(Err(LinkFailure::Unavailable))
    }

    fn start_preview(&self) -> Result<(), LinkFailure> {
        self.lock()
            .start_preview
            .unwrap_or(Err(LinkFailure::Unavailable))
    }

    fn next_frame(&self) -> Result<Frame, LinkFailure> {
        self.lock()
            .next_frame
            .clone()
            .unwrap_or(Err(LinkFailure::Unavailable))
    }

    fn start_recording(&self, _options: &RecordingOptions) -> Result<(), LinkFailure> {
        self.lock()
            .start_recording
            .unwrap_or(Err(LinkFailure::Unavailable))
    }

    fn recording_orientation(&self) -> Orientation {
        self.lock()
            .recording_orientation
            .unwrap_or(Orientation::PortraitUp)
    }

    fn stop_recording(&self) -> Result<Recording, LinkFailure> {
        self.lock()
            .stop_recording
            .clone()
            .unwrap_or(Err(LinkFailure::Unavailable))
    }

    fn cancel_recording(&self) -> Result<(), LinkFailure> {
        self.lock()
            .cancel_recording
            .unwrap_or(Err(LinkFailure::Unavailable))
    }

    fn close_device(&self) -> Result<(), LinkFailure> {
        self.lock()
            .close_device
            .unwrap_or(Err(LinkFailure::Unavailable))
    }
}

/// A camera backend over a CameraX link; maps link results onto camera errors.
pub struct AndroidBackend<L: CameraXLink> {
    link: Arc<L>,
}

impl AndroidBackend<NullLink> {
    /// Returns a backend over the unwired NullLink: every call resolves NotAvailable.
    pub fn new() -> Self {
        Self {
            link: Arc::new(NullLink),
        }
    }
}

impl<L: CameraXLink> AndroidBackend<L> {
    /// Returns a backend over the given link.
    pub fn with_link(link: Arc<L>) -> Self {
        Self { link }
    }
}

impl Default for AndroidBackend<NullLink> {
    fn default() -> Self {
        Self::new()
    }
}

impl<L: CameraXLink + 'static> Backend for AndroidBackend<L> {
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
            Ok(devices) => Ok(devices),
            Err(LinkFailure::Busy) => Err(CameraError::new(ErrorKind::DeviceBusy)),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            // Failures this call cannot produce still resolve once, as a coded error.
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }

    fn open_device(&self, id: &CameraId) -> Result<Box<dyn DeviceBackend>, CameraError> {
        match self.link.open_device(id) {
            Ok(()) => Ok(Box::new(AndroidDevice {
                link: Arc::clone(&self.link),
            })),
            Err(LinkFailure::Busy) => Err(CameraError::new(ErrorKind::DeviceBusy)),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            // Failures this call cannot produce still resolve once, as a coded error.
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }
}

/// An open camera device; forwards to the link and maps failures.
pub struct AndroidDevice<L: CameraXLink> {
    link: Arc<L>,
}

impl<L: CameraXLink + 'static> DeviceBackend for AndroidDevice<L> {
    fn capture_photo(&self, options: &PhotoOptions) -> Result<Photo, CameraError> {
        match self.link.capture_photo(options) {
            Ok(photo) => Ok(photo),
            Err(LinkFailure::Format) => Err(CameraError::new(ErrorKind::FormatUnsupported)),
            Err(LinkFailure::Busy) => Err(CameraError::new(ErrorKind::DeviceBusy)),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            // Failures this call cannot produce still resolve once, as a coded error.
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }

    fn start_preview(&self) -> Result<Box<dyn PreviewBackend>, CameraError> {
        match self.link.start_preview() {
            Ok(()) => Ok(Box::new(AndroidPreview {
                link: Arc::clone(&self.link),
            })),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            // Failures this call cannot produce still resolve once, as a coded error.
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }

    fn start_recording(
        &self,
        options: &RecordingOptions,
    ) -> Result<Box<dyn RecordingBackend>, CameraError> {
        // An audio recording clears the microphone gate before the link is asked to record.
        if options.audio {
            match self.link.mic_permission_probe() {
                LinkPermission::Granted => Ok(()),
                LinkPermission::DeclinedOnce
                | LinkPermission::DeclinedPermanently
                | LinkPermission::Restricted => {
                    Err(CameraError::new(ErrorKind::MicPermissionDenied))
                }
                LinkPermission::Unavailable => Err(CameraError::new(ErrorKind::NotAvailable)),
            }?;
        }
        match self.link.start_recording(options) {
            Ok(()) => Ok(Box::new(AndroidRecording {
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
            // Failures this call cannot produce still resolve once, as a coded error.
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
            // Failures this call cannot produce still resolve once, as a coded error.
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }
}

/// A live preview; frames come from the link's next_frame.
pub struct AndroidPreview<L: CameraXLink> {
    link: Arc<L>,
}

impl<L: CameraXLink> PreviewBackend for AndroidPreview<L> {
    fn next_frame(&self) -> Result<Frame, CameraError> {
        match self.link.next_frame() {
            Ok(frame) => Ok(frame),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            // Failures this call cannot produce still resolve once, as a coded error.
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }

    fn close(&self) -> Result<(), CameraError> {
        // The link layer has no preview teardown call; closing resolves right here.
        Ok(())
    }
}

/// An in-flight recording; stop and cancel forward to the link.
pub struct AndroidRecording<L: CameraXLink> {
    link: Arc<L>,
}

impl<L: CameraXLink> RecordingBackend for AndroidRecording<L> {
    fn orientation(&self) -> Orientation {
        self.link.recording_orientation()
    }

    fn stop(&self) -> Result<Recording, CameraError> {
        match self.link.stop_recording() {
            Ok(recording) => Ok(recording),
            Err(LinkFailure::Interrupted) => Err(CameraError::new(ErrorKind::Interrupted)),
            Err(LinkFailure::Unavailable) => Err(CameraError::new(ErrorKind::NotAvailable)),
            // Failures this call cannot produce still resolve once, as a coded error.
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }

    fn cancel(&self) -> Result<(), CameraError> {
        match self.link.cancel_recording() {
            Ok(()) => Ok(()),
            Err(LinkFailure::Unavailable) => Err(CameraError::new(ErrorKind::NotAvailable)),
            // Failures this call cannot produce still resolve once, as a coded error.
            Err(_) => Err(CameraError::new(ErrorKind::Backend)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Camera;
    use crate::options::{CameraPosition, Resolution};

    fn err_kind<T>(result: Result<T, CameraError>) -> Option<ErrorKind> {
        result.err().map(|err| err.kind())
    }

    fn scripted_camera() -> (Arc<ScriptedLink>, Camera) {
        let link = Arc::new(ScriptedLink::new());
        let backend = AndroidBackend::with_link(Arc::clone(&link));
        (Arc::clone(&link), Camera::with_backend(Arc::new(backend)))
    }

    #[test]
    fn null_link_resolves_not_available_everywhere() {
        let camera = Camera::with_backend(Arc::new(AndroidBackend::new()));
        assert_eq!(err_kind(camera.permission()), Some(ErrorKind::NotAvailable));
        assert_eq!(
            err_kind(camera.request_permission()),
            Some(ErrorKind::NotAvailable)
        );
        assert_eq!(err_kind(camera.devices()), Some(ErrorKind::NotAvailable));
        assert_eq!(
            err_kind(camera.open(&CameraId("0".into()))),
            Some(ErrorKind::NotAvailable)
        );
    }

    #[test]
    fn granted_probes_report_granted() {
        let (link, camera) = scripted_camera();
        link.set_permission_probe(LinkPermission::Granted);
        link.set_request_permission(LinkPermission::Granted);
        assert_eq!(camera.permission().ok(), Some(PermissionState::Granted));
        assert_eq!(
            camera.request_permission().ok(),
            Some(PermissionState::Granted)
        );
    }

    #[test]
    fn declined_once_reports_denied_and_permission_denied() {
        let (link, camera) = scripted_camera();
        link.set_permission_probe(LinkPermission::DeclinedOnce);
        link.set_request_permission(LinkPermission::DeclinedOnce);
        assert_eq!(camera.permission().ok(), Some(PermissionState::Denied));
        assert_eq!(
            err_kind(camera.request_permission()),
            Some(ErrorKind::PermissionDenied)
        );
    }

    #[test]
    fn declined_permanently_maps_to_permanently_denied() {
        let (link, camera) = scripted_camera();
        link.set_permission_probe(LinkPermission::DeclinedPermanently);
        link.set_request_permission(LinkPermission::DeclinedPermanently);
        assert_eq!(camera.permission().ok(), Some(PermissionState::Denied));
        assert_eq!(
            err_kind(camera.request_permission()),
            Some(ErrorKind::PermissionPermanentlyDenied)
        );
    }

    #[test]
    fn restricted_probe_maps_to_permission_restricted() {
        let (link, camera) = scripted_camera();
        link.set_permission_probe(LinkPermission::Restricted);
        link.set_request_permission(LinkPermission::Restricted);
        assert_eq!(camera.permission().ok(), Some(PermissionState::Denied));
        assert_eq!(
            err_kind(camera.request_permission()),
            Some(ErrorKind::PermissionRestricted)
        );
    }

    #[test]
    fn declined_mic_probe_fails_audio_recording() {
        let (link, camera) = scripted_camera();
        link.set_open_device();
        link.set_mic_permission(LinkPermission::DeclinedOnce);
        let device = camera
            .open(&CameraId("0".into()))
            .expect("scripted open resolves");
        let options = RecordingOptions {
            audio: true,
            ..Default::default()
        };
        assert_eq!(
            err_kind(device.start_recording(&options)),
            Some(ErrorKind::MicPermissionDenied)
        );
    }

    #[test]
    fn audio_permission_failure_maps_to_mic_permission_denied() {
        let (link, camera) = scripted_camera();
        link.set_open_device();
        link.set_mic_permission(LinkPermission::Granted);
        link.fail_start_recording(LinkFailure::AudioPermission);
        let device = camera
            .open(&CameraId("0".into()))
            .expect("scripted open resolves");
        let options = RecordingOptions {
            audio: true,
            ..Default::default()
        };
        assert_eq!(
            err_kind(device.start_recording(&options)),
            Some(ErrorKind::MicPermissionDenied)
        );
    }

    #[test]
    fn device_list_busy_maps_to_device_busy() {
        let (link, camera) = scripted_camera();
        link.fail_device_list(LinkFailure::Busy);
        assert_eq!(err_kind(camera.devices()), Some(ErrorKind::DeviceBusy));
    }

    #[test]
    fn device_list_missing_maps_to_not_available() {
        let (link, camera) = scripted_camera();
        link.fail_device_list(LinkFailure::Missing);
        assert_eq!(err_kind(camera.devices()), Some(ErrorKind::NotAvailable));
    }

    #[test]
    fn device_list_returns_scripted_devices() {
        let (link, camera) = scripted_camera();
        link.set_device_list(vec![CameraInfo {
            id: CameraId("0".into()),
            name: "Back".into(),
            position: CameraPosition::Back,
        }]);
        let devices = camera.devices().expect("scripted list resolves");
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].id.0, "0");
    }

    #[test]
    fn open_busy_failure_maps_to_device_busy() {
        let (link, camera) = scripted_camera();
        link.fail_open_device(LinkFailure::Busy);
        assert_eq!(
            err_kind(camera.open(&CameraId("0".into()))),
            Some(ErrorKind::DeviceBusy)
        );
    }

    #[test]
    fn capture_format_failure_maps_to_format_unsupported() {
        let (link, camera) = scripted_camera();
        link.set_open_device();
        link.fail_capture_photo(LinkFailure::Format);
        let device = camera
            .open(&CameraId("0".into()))
            .expect("scripted open resolves");
        assert_eq!(
            err_kind(device.capture_photo(&PhotoOptions::default())),
            Some(ErrorKind::FormatUnsupported)
        );
    }

    #[test]
    fn capture_returns_the_scripted_photo() {
        let (link, camera) = scripted_camera();
        link.set_open_device();
        let scripted = Photo {
            data: vec![7, 7, 7],
            mime: "image/heif",
            resolution: Resolution {
                width: 1280,
                height: 720,
            },
            orientation: Orientation::PortraitDown,
        };
        link.set_capture_photo(scripted.clone());
        let device = camera
            .open(&CameraId("0".into()))
            .expect("scripted open resolves");
        assert_eq!(device.capture_photo(&PhotoOptions::default()), Ok(scripted));
    }

    #[test]
    fn start_preview_missing_maps_to_not_available() {
        let (link, camera) = scripted_camera();
        link.set_open_device();
        link.fail_start_preview(LinkFailure::Missing);
        let device = camera
            .open(&CameraId("0".into()))
            .expect("scripted open resolves");
        assert_eq!(
            err_kind(device.start_preview()),
            Some(ErrorKind::NotAvailable)
        );
    }

    #[test]
    fn frames_forward_to_the_link() {
        let (link, _camera) = scripted_camera();
        // start_preview cannot be armed Ok on a scripted link, so the stream
        // is built directly to reach the frame mappings.
        let stream = AndroidPreview {
            link: Arc::clone(&link),
        };
        let scripted = Frame {
            data: vec![9],
            resolution: Resolution {
                width: 64,
                height: 64,
            },
            orientation: Orientation::PortraitUp,
        };
        link.set_next_frame(scripted.clone());
        assert_eq!(stream.next_frame(), Ok(scripted));
        link.fail_next_frame(LinkFailure::Missing);
        assert_eq!(err_kind(stream.next_frame()), Some(ErrorKind::NotAvailable));
    }

    #[test]
    fn recording_orientation_failure_maps_to_orientation_unsupported() {
        let (link, camera) = scripted_camera();
        link.set_open_device();
        link.fail_start_recording(LinkFailure::Orientation);
        let device = camera
            .open(&CameraId("0".into()))
            .expect("scripted open resolves");
        let options = RecordingOptions {
            orientation: Some(Orientation::PortraitUp),
            ..Default::default()
        };
        assert_eq!(
            err_kind(device.start_recording(&options)),
            Some(ErrorKind::OrientationUnsupported)
        );
    }

    #[test]
    fn interrupted_stop_maps_to_interrupted() {
        let (link, _camera) = scripted_camera();
        link.fail_stop_recording(LinkFailure::Interrupted);
        // start_recording cannot be armed Ok on a scripted link, so the session
        // is built directly to reach the stop mapping.
        let session = AndroidRecording {
            link: Arc::clone(&link),
        };
        assert_eq!(err_kind(session.stop()), Some(ErrorKind::Interrupted));
    }

    #[test]
    fn stop_returns_the_scripted_recording() {
        let (link, _camera) = scripted_camera();
        // start_recording cannot be armed Ok on a scripted link, so the session
        // is built directly to reach the stop mapping.
        let session = AndroidRecording {
            link: Arc::clone(&link),
        };
        let scripted = Recording {
            data: vec![4, 5],
            mime: "video/mp4",
            resolution: Resolution {
                width: 1920,
                height: 1080,
            },
        };
        link.set_stop_recording(scripted.clone());
        assert_eq!(session.stop(), Ok(scripted));
    }

    #[test]
    fn cancel_and_orientation_forward_to_the_link() {
        let (link, _camera) = scripted_camera();
        link.set_recording_orientation(Orientation::LandscapeLeft);
        let session = AndroidRecording {
            link: Arc::clone(&link),
        };
        assert_eq!(session.orientation(), Orientation::LandscapeLeft);
        assert_eq!(err_kind(session.cancel()), Some(ErrorKind::NotAvailable));
        link.set_cancel_recording();
        assert_eq!(session.cancel().ok(), Some(()));
    }

    #[test]
    fn invalid_arguments_never_reach_the_link() {
        let (link, camera) = scripted_camera();
        link.set_open_device();
        // The high level refuses before the backend runs: a link answer here
        // would be NotAvailable, never InvalidArgument.
        assert_eq!(
            err_kind(camera.open(&CameraId(String::new()))),
            Some(ErrorKind::InvalidArgument)
        );
        let device = camera
            .open(&CameraId("0".into()))
            .expect("scripted open resolves");
        let options = RecordingOptions {
            mime: Some(""),
            ..Default::default()
        };
        assert_eq!(
            err_kind(device.start_recording(&options)),
            Some(ErrorKind::InvalidArgument)
        );
    }
}
