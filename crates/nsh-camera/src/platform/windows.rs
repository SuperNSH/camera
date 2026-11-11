//! The Windows bridge: nokhwa on desktop (docs/brief.md) over Media Foundation.
//!
//! Windows keeps a per-app camera privacy gate (Settings, Privacy, Camera), so the link carries
//! permission probes even on desktop. A desktop webcam cannot re-orient a recording, so an
//! orientation a recording locks to fails at start as `LinkFailure::Orientation`.

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

/// The link's own answer about a permission, before the bridge maps it onto the crate's codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LinkPermission {
    /// The system granted the permission.
    Granted,
    /// The system declined once; asking again is still possible.
    DeclinedOnce,
    /// The system declined for good; only Settings changes it.
    DeclinedPermanently,
    /// A policy restricts the permission, so it cannot be requested.
    Restricted,
    /// No native link is wired, so no answer exists.
    Unavailable,
}

/// Why a link call failed, in the platform's terms; the bridge maps each onto one `ErrorKind`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LinkFailure {
    /// The camera is held by another app or process.
    Busy,
    /// No such camera exists here.
    Missing,
    /// The microphone permission the recording asked for was declined.
    AudioPermission,
    /// The device cannot deliver the requested format, resolution, or frame rate.
    Format,
    /// The platform cannot honor the requested recording orientation.
    Orientation,
    /// The system stopped the recording before it finished.
    Interrupted,
    /// No native link is wired.
    Unavailable,
}

/// The nokhwa calls this platform makes once a native backend lands (docs/brief.md).
///
/// Every method answers at once; none waits on the OS, a thread, or a channel.
pub trait NokhwaLink: Send + Sync {
    /// The camera permission as the system last recorded it; never asks.
    fn permission_probe(&self) -> LinkPermission;
    /// Asks the system for the camera permission, once.
    fn request_permission(&self) -> LinkPermission;
    /// The microphone permission, consulted when a recording asks for audio.
    fn mic_permission_probe(&self) -> LinkPermission;
    /// The cameras attached to this machine.
    fn device_list(&self) -> Result<Vec<CameraInfo>, LinkFailure>;
    /// Opens the camera `id`.
    fn open_device(&self, id: &CameraId) -> Result<(), LinkFailure>;
    /// Captures one photo.
    fn capture_photo(&self, options: &PhotoOptions) -> Result<Photo, LinkFailure>;
    /// Starts the preview stream.
    fn start_preview(&self) -> Result<(), LinkFailure>;
    /// Returns the next preview frame.
    fn next_frame(&self) -> Result<Frame, LinkFailure>;
    /// Starts one recording.
    fn start_recording(&self, options: &RecordingOptions) -> Result<(), LinkFailure>;
    /// The orientation the running recording reports.
    fn recording_orientation(&self) -> Orientation;
    /// Stops the recording and returns its bytes.
    fn stop_recording(&self) -> Result<Recording, LinkFailure>;
    /// Cancels the recording, discarding its bytes.
    fn cancel_recording(&self) -> Result<(), LinkFailure>;
    /// Closes the open device.
    fn close_device(&self) -> Result<(), LinkFailure>;
}

// A failure the mapping table names nowhere for this call is a broken link, not a camera state.
fn broken_link() -> CameraError {
    CameraError::new(ErrorKind::Backend)
}

/// The link every `WindowsBackend::new()` wires: no native layer exists this release.
pub struct NullLink;

impl NokhwaLink for NullLink {
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

    // No recording exists without a link, and a bare orientation still has to be reported.
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

    pub fn set_permission_probe(&self, answer: LinkPermission) {
        self.lock().permission_probe = Some(answer);
    }

    pub fn set_request_permission(&self, answer: LinkPermission) {
        self.lock().request_permission = Some(answer);
    }

    pub fn set_mic_permission(&self, answer: LinkPermission) {
        self.lock().mic_permission = Some(answer);
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

    // Cancel maps only Ok or Unavailable, so it arms the success and has no fail setter.
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
impl NokhwaLink for ScriptedLink {
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

    // Orientation has no Unavailable, so an unscripted link reports the sensor's rest orientation.
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

/// The Windows backend over one shared link; [`crate::camera::Camera`] adds the rules.
///
/// `new()` wires a [`NullLink`], so an unwired backend resolves `Err(NotAvailable)` everywhere.
pub struct WindowsBackend<L: NokhwaLink> {
    link: Arc<L>,
}

impl WindowsBackend<NullLink> {
    /// A backend no native link is wired to.
    pub fn new() -> Self {
        Self {
            link: Arc::new(NullLink),
        }
    }
}

impl Default for WindowsBackend<NullLink> {
    fn default() -> Self {
        Self::new()
    }
}

impl<L: NokhwaLink> WindowsBackend<L> {
    /// A backend over `link`, which every device, preview, and recording it returns shares.
    pub fn with_link(link: Arc<L>) -> Self {
        Self { link }
    }
}

impl<L: NokhwaLink + 'static> Backend for WindowsBackend<L> {
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
            Err(_) => Err(broken_link()),
        }
    }

    fn open_device(&self, id: &CameraId) -> Result<Box<dyn DeviceBackend>, CameraError> {
        match self.link.open_device(id) {
            Ok(()) => Ok(Box::new(WindowsDevice {
                link: Arc::clone(&self.link),
            })),
            Err(LinkFailure::Busy) => Err(CameraError::new(ErrorKind::DeviceBusy)),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            Err(_) => Err(broken_link()),
        }
    }
}

/// One open camera. [`crate::device::CameraDevice`] adds the exactly-once rules on top.
pub struct WindowsDevice<L: NokhwaLink> {
    link: Arc<L>,
}

impl<L: NokhwaLink + 'static> DeviceBackend for WindowsDevice<L> {
    fn capture_photo(&self, options: &PhotoOptions) -> Result<Photo, CameraError> {
        match self.link.capture_photo(options) {
            Ok(photo) => Ok(photo),
            Err(LinkFailure::Format) => Err(CameraError::new(ErrorKind::FormatUnsupported)),
            Err(LinkFailure::Busy) => Err(CameraError::new(ErrorKind::DeviceBusy)),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            Err(_) => Err(broken_link()),
        }
    }

    fn start_preview(&self) -> Result<Box<dyn PreviewBackend>, CameraError> {
        match self.link.start_preview() {
            Ok(()) => Ok(Box::new(WindowsPreview {
                link: Arc::clone(&self.link),
            })),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            Err(_) => Err(broken_link()),
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
            Ok(()) => Ok(Box::new(WindowsRecording {
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
            Err(LinkFailure::Interrupted) => Err(broken_link()),
        }
    }

    fn close(&self) -> Result<(), CameraError> {
        match self.link.close_device() {
            Ok(()) => Ok(()),
            Err(LinkFailure::Busy) => Err(CameraError::new(ErrorKind::DeviceBusy)),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            Err(_) => Err(broken_link()),
        }
    }
}

/// The preview stream of one open camera. Closing it needs no native call; the link has none,
/// and [`crate::device::PreviewStream`] holds the closed state.
pub struct WindowsPreview<L: NokhwaLink> {
    link: Arc<L>,
}

impl<L: NokhwaLink> PreviewBackend for WindowsPreview<L> {
    fn next_frame(&self) -> Result<Frame, CameraError> {
        match self.link.next_frame() {
            Ok(frame) => Ok(frame),
            Err(LinkFailure::Missing | LinkFailure::Unavailable) => {
                Err(CameraError::new(ErrorKind::NotAvailable))
            }
            Err(_) => Err(broken_link()),
        }
    }

    fn close(&self) -> Result<(), CameraError> {
        Ok(())
    }
}

/// The running recording. The first of stop or cancel resolves it; the link only answers,
/// and [`crate::device::RecordingSession`] enforces the once rule.
pub struct WindowsRecording<L: NokhwaLink> {
    link: Arc<L>,
}

impl<L: NokhwaLink> RecordingBackend for WindowsRecording<L> {
    fn orientation(&self) -> Orientation {
        self.link.recording_orientation()
    }

    fn stop(&self) -> Result<Recording, CameraError> {
        match self.link.stop_recording() {
            Ok(recording) => Ok(recording),
            Err(LinkFailure::Interrupted) => Err(CameraError::new(ErrorKind::Interrupted)),
            Err(LinkFailure::Unavailable) => Err(CameraError::new(ErrorKind::NotAvailable)),
            Err(_) => Err(broken_link()),
        }
    }

    fn cancel(&self) -> Result<(), CameraError> {
        match self.link.cancel_recording() {
            Ok(()) => Ok(()),
            Err(LinkFailure::Unavailable) => Err(CameraError::new(ErrorKind::NotAvailable)),
            Err(_) => Err(broken_link()),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::{
        LinkFailure, LinkPermission, ScriptedLink, WindowsBackend, WindowsPreview, WindowsRecording,
    };
    use crate::backend::{Backend, DeviceBackend, PreviewBackend, RecordingBackend};
    use crate::camera::Camera;
    use crate::error::ErrorKind;
    use crate::options::{
        CameraId, CameraInfo, CameraPosition, Frame, Orientation, PermissionState, Photo,
        PhotoOptions, Recording, RecordingOptions, Resolution,
    };

    fn scripted() -> Arc<ScriptedLink> {
        Arc::new(ScriptedLink::new())
    }

    fn camera_id() -> CameraId {
        CameraId("win-cam".to_owned())
    }

    #[test]
    fn null_link_resolves_not_available_through_camera() {
        let camera = Camera::with_backend(Arc::new(WindowsBackend::new()));

        let err = camera.permission().err().expect("permission unavailable");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);
        assert_eq!(err.code(), "ERR_CAMERA_NOT_AVAILABLE");

        let err = camera
            .request_permission()
            .err()
            .expect("request unavailable");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);

        let err = camera.devices().err().expect("devices unavailable");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);

        let err = camera.open(&camera_id()).err().expect("open unavailable");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);
    }

    #[test]
    fn permission_probes_map_per_the_table() {
        let link = scripted();
        let backend = WindowsBackend::with_link(Arc::clone(&link));

        link.set_permission_probe(LinkPermission::Granted);
        assert_eq!(
            backend.permission().expect("granted"),
            PermissionState::Granted
        );

        for declined in [
            LinkPermission::DeclinedOnce,
            LinkPermission::DeclinedPermanently,
            LinkPermission::Restricted,
        ] {
            link.set_permission_probe(declined);
            assert_eq!(
                backend.permission().expect("declined"),
                PermissionState::Denied
            );
        }

        link.set_request_permission(LinkPermission::Granted);
        assert_eq!(
            backend.request_permission().expect("granted"),
            PermissionState::Granted
        );

        link.set_request_permission(LinkPermission::DeclinedOnce);
        let err = backend.request_permission().err().expect("declined once");
        assert_eq!(err.kind(), ErrorKind::PermissionDenied);

        link.set_request_permission(LinkPermission::DeclinedPermanently);
        let err = backend
            .request_permission()
            .err()
            .expect("declined permanently");
        assert_eq!(err.kind(), ErrorKind::PermissionPermanentlyDenied);

        link.set_request_permission(LinkPermission::Restricted);
        let err = backend.request_permission().err().expect("restricted");
        assert_eq!(err.kind(), ErrorKind::PermissionRestricted);
    }

    #[test]
    fn recording_with_audio_maps_the_mic_gate() {
        let link = scripted();
        let backend = WindowsBackend::with_link(Arc::clone(&link));
        link.set_open_device();
        let device = backend.open_device(&camera_id()).expect("open");

        let audio = RecordingOptions {
            resolution: None,
            fps: None,
            mime: None,
            audio: true,
            orientation: None,
        };

        // An unscripted mic probe has no answer, so the recording cannot start.
        let err = device.start_recording(&audio).err().expect("mic unwired");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);

        // A declined mic probe stops the recording before the link is asked to start one;
        // the scripted Busy start failure is what the call would answer if it were reached.
        link.set_mic_permission(LinkPermission::DeclinedOnce);
        link.fail_start_recording(LinkFailure::Busy);
        let err = device.start_recording(&audio).err().expect("mic denied");
        assert_eq!(err.kind(), ErrorKind::MicPermissionDenied);

        // A granted probe lets the start through; the link's own audio failure maps the same way.
        link.set_mic_permission(LinkPermission::Granted);
        link.fail_start_recording(LinkFailure::AudioPermission);
        let err = device
            .start_recording(&audio)
            .err()
            .expect("audio permission");
        assert_eq!(err.kind(), ErrorKind::MicPermissionDenied);
    }

    #[test]
    fn device_list_maps_list_busy_and_missing() {
        let link = scripted();
        let backend = WindowsBackend::with_link(Arc::clone(&link));

        let webcam = CameraInfo {
            id: camera_id(),
            name: "HD Webcam".to_owned(),
            position: CameraPosition::External,
        };
        link.set_device_list(vec![webcam.clone()]);
        assert_eq!(backend.devices().expect("list"), vec![webcam]);

        link.fail_device_list(LinkFailure::Busy);
        let err = backend.devices().err().expect("busy");
        assert_eq!(err.kind(), ErrorKind::DeviceBusy);

        link.fail_device_list(LinkFailure::Missing);
        let err = backend.devices().err().expect("missing");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);
    }

    #[test]
    fn open_then_capture_maps_format_unsupported() {
        let link = scripted();
        let backend = WindowsBackend::with_link(Arc::clone(&link));
        link.set_open_device();
        let device = backend.open_device(&camera_id()).expect("open");

        link.fail_capture_photo(LinkFailure::Format);
        let err = device
            .capture_photo(&PhotoOptions {
                resolution: None,
                mime: None,
            })
            .err()
            .expect("format");
        assert_eq!(err.kind(), ErrorKind::FormatUnsupported);

        // A scripted photo passes through unchanged.
        link.set_capture_photo(Photo {
            data: vec![1, 2, 3],
            mime: "image/jpeg",
            resolution: Resolution {
                width: 640,
                height: 480,
            },
            orientation: Orientation::PortraitUp,
        });
        let photo = device
            .capture_photo(&PhotoOptions {
                resolution: None,
                mime: None,
            })
            .expect("scripted photo");
        assert_eq!(photo.data, vec![1, 2, 3]);
        assert_eq!(photo.mime, "image/jpeg");

        // close_device has no script here, so it resolves the unwired answer.
        let err = device.close().err().expect("close unwired");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);
    }

    #[test]
    fn start_recording_maps_orientation_unsupported() {
        let link = scripted();
        let backend = WindowsBackend::with_link(Arc::clone(&link));
        link.set_open_device();
        let device = backend.open_device(&camera_id()).expect("open");

        // audio false: an unscripted mic probe must not surface on a silent recording.
        link.fail_start_recording(LinkFailure::Orientation);
        let err = device
            .start_recording(&RecordingOptions {
                resolution: None,
                fps: None,
                mime: None,
                audio: false,
                orientation: Some(Orientation::LandscapeLeft),
            })
            .err()
            .expect("orientation lock");
        assert_eq!(err.kind(), ErrorKind::OrientationUnsupported);
    }

    #[test]
    fn stop_maps_interrupted_and_cancel_maps_the_script() {
        let interrupted = scripted();
        interrupted.fail_stop_recording(LinkFailure::Interrupted);
        let session = WindowsRecording {
            link: Arc::clone(&interrupted),
        };
        let err = session.stop().err().expect("interrupted");
        assert_eq!(err.kind(), ErrorKind::Interrupted);

        let finished = scripted();
        finished.set_recording_orientation(Orientation::LandscapeRight);
        finished.set_stop_recording(Recording {
            data: vec![4, 5, 6],
            mime: "video/mp4",
            resolution: Resolution {
                width: 1280,
                height: 720,
            },
        });
        finished.set_cancel_recording();
        let session = WindowsRecording {
            link: Arc::clone(&finished),
        };
        assert_eq!(session.orientation(), Orientation::LandscapeRight);
        let recording = session.stop().expect("stopped");
        assert_eq!(recording.data, vec![4, 5, 6]);
        assert_eq!(recording.mime, "video/mp4");

        let unwired = scripted();
        let session = WindowsRecording {
            link: Arc::clone(&unwired),
        };
        let err = session.cancel().err().expect("cancel unwired");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);
    }

    #[test]
    fn preview_maps_start_missing_and_next_frame() {
        let link = scripted();
        let backend = WindowsBackend::with_link(Arc::clone(&link));
        link.set_open_device();
        let device = backend.open_device(&camera_id()).expect("open");

        let err = device.start_preview().err().expect("start unwired");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);

        link.fail_start_preview(LinkFailure::Missing);
        let err = device.start_preview().err().expect("start missing");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);

        let preview = WindowsPreview {
            link: Arc::clone(&link),
        };
        link.set_next_frame(Frame {
            data: vec![9],
            resolution: Resolution {
                width: 320,
                height: 240,
            },
            orientation: Orientation::PortraitUp,
        });
        assert_eq!(preview.next_frame().expect("frame").data, vec![9]);

        link.fail_next_frame(LinkFailure::Missing);
        let err = preview.next_frame().err().expect("frame missing");
        assert_eq!(err.kind(), ErrorKind::NotAvailable);

        preview.close().expect("preview close");
    }

    #[test]
    fn invalid_arguments_never_reach_the_link() {
        let link = scripted();
        let camera = Camera::with_backend(Arc::new(WindowsBackend::with_link(Arc::clone(&link))));

        // The link would answer DeviceBusy if it were reached.
        link.fail_open_device(LinkFailure::Busy);
        let err = camera
            .open(&CameraId(String::new()))
            .err()
            .expect("empty id");
        assert_eq!(err.kind(), ErrorKind::InvalidArgument);

        link.set_open_device();
        let device = camera.open(&camera_id()).expect("open");

        // The link would answer DeviceBusy if it were reached.
        link.fail_capture_photo(LinkFailure::Busy);
        let err = device
            .capture_photo(&PhotoOptions {
                resolution: None,
                mime: Some(""),
            })
            .err()
            .expect("empty mime");
        assert_eq!(err.kind(), ErrorKind::InvalidArgument);
    }
}
