//! The camera as TSX sees it: `NativeCamera`, a class whose async members reject with a `code`
//! on failure. Open devices, previews and recordings stay on the Rust side as numbered handles;
//! TSX holds the numbers. Results are plain values, bytes as `Vec<u8>`.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};

use nsh_core::prelude::*;

use crate::{
    Camera, CameraDevice, CameraError, CameraId, CameraInfo, CameraPosition, ErrorKind, Frame,
    Orientation, PermissionState, Photo, PhotoOptions, PreviewStream, Recording, RecordingOptions,
    RecordingSession, Resolution,
};

/// One camera TSX lists.
#[derive(JsObject, Clone, Debug, PartialEq)]
pub struct NativeCameraInfo {
    /// The id `open` takes.
    pub id: String,
    /// The platform's name for the camera.
    pub name: String,
    /// `"front"`, `"back"` or `"external"`.
    pub position: String,
}

/// The options of one photo, from TSX. Unset fields keep the defaults; `width` and `height` go
/// together.
#[derive(JsObject, Clone, Debug, Default)]
pub struct NativePhotoOptions {
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// `"image/jpeg"` or `"image/heif"`; an empty string is refused by the device.
    pub mime: Option<String>,
}

/// The options of one recording, from TSX. Unset fields keep the defaults; `width` and `height`
/// go together.
#[derive(JsObject, Clone, Debug, Default)]
pub struct NativeRecordingOptions {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<u32>,
    /// `"video/mp4"`; an empty string is refused by the device.
    pub mime: Option<String>,
    pub audio: Option<bool>,
    /// `"portrait-up"`, `"landscape-left"`, `"landscape-right"` or `"portrait-down"`.
    pub orientation: Option<String>,
}

/// One captured photo.
#[derive(JsObject, Clone, Debug, PartialEq)]
pub struct NativePhoto {
    pub data: Vec<u8>,
    pub mime: String,
    pub width: u32,
    pub height: u32,
    pub orientation: String,
}

/// One finished recording.
#[derive(JsObject, Clone, Debug, PartialEq)]
pub struct NativeRecording {
    pub data: Vec<u8>,
    pub mime: String,
    pub width: u32,
    pub height: u32,
}

/// One preview frame.
#[derive(JsObject, Clone, Debug, PartialEq)]
pub struct NativeFrame {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub orientation: String,
}

/// A started recording: its handle and the orientation it began with.
#[derive(JsObject, Clone, Debug, PartialEq)]
pub struct NativeRecordingStart {
    pub handle: u32,
    pub orientation: String,
}

/// What `NativeCamera` keeps open. Entries stay after a close, so a second call on a handle is
/// the device's `ERR_CAMERA_ALREADY_RESOLVED` and not an unknown handle.
#[derive(Default)]
struct Handles {
    next: u32,
    devices: HashMap<u32, Arc<CameraDevice>>,
    previews: HashMap<u32, Arc<PreviewStream>>,
    recordings: HashMap<u32, Arc<RecordingSession>>,
}

impl Handles {
    fn next_handle(&mut self) -> u32 {
        self.next += 1;
        self.next
    }
}

/// A camera handle. Create one and keep it; its handles live as long as it does.
#[class]
pub struct NativeCamera {
    camera: Camera,
    handles: Mutex<Handles>,
}

#[class]
impl NativeCamera {
    /// The platform's camera service.
    pub fn new() -> NativeCamera {
        NativeCamera {
            camera: Camera::new(),
            handles: Mutex::new(Handles::default()),
        }
    }

    /// The permission as it stands: `"not-determined"`, `"granted"` or `"denied"`.
    pub async fn permission(this: Instance<Self>) -> Result<String, JsError> {
        let state = this
            .with(|native| native.camera.permission())
            .map_err(into_js)?;
        Ok(permission_name(state).to_owned())
    }

    /// Asks for the permission and reports how it ended.
    pub async fn request_permission(this: Instance<Self>) -> Result<String, JsError> {
        let state = this
            .with(|native| native.camera.request_permission())
            .map_err(into_js)?;
        Ok(permission_name(state).to_owned())
    }

    /// The platform's cameras.
    pub async fn devices(this: Instance<Self>) -> Result<Vec<NativeCameraInfo>, JsError> {
        let found = this
            .with(|native| native.camera.devices())
            .map_err(into_js)?;
        Ok(found.into_iter().map(native_info).collect())
    }

    /// Opens the camera `id` and answers its device handle.
    pub async fn open(this: Instance<Self>, id: String) -> Result<u32, JsError> {
        this.with(|native| {
            let device = native.camera.open(&CameraId(id)).map_err(into_js)?;
            let mut handles = native.handles();
            let handle = handles.next_handle();
            handles.devices.insert(handle, Arc::new(device));
            Ok::<u32, JsError>(handle)
        })
    }

    /// Captures one photo on the device `device`.
    pub async fn capture_photo(
        this: Instance<Self>,
        device: u32,
        options: Option<NativePhotoOptions>,
    ) -> Result<NativePhoto, JsError> {
        let device = this.with(|native| native.device(device))?;
        let options = to_photo_options(options.unwrap_or_default())?;
        let photo = device.capture_photo(&options).map_err(into_js)?;
        Ok(native_photo(photo))
    }

    /// Starts the preview of the device `device` and answers its handle.
    pub async fn start_preview(this: Instance<Self>, device: u32) -> Result<u32, JsError> {
        let found = this.with(|native| native.device(device))?;
        let preview = found.start_preview().map_err(into_js)?;
        Ok(this.with(|native| {
            let mut handles = native.handles();
            let handle = handles.next_handle();
            handles.previews.insert(handle, Arc::new(preview));
            handle
        }))
    }

    /// The next frame of the preview `preview`.
    pub async fn next_frame(this: Instance<Self>, preview: u32) -> Result<NativeFrame, JsError> {
        let preview = this.with(|native| native.preview(preview))?;
        Ok(native_frame(preview.next_frame().map_err(into_js)?))
    }

    /// Stops the preview `preview`.
    pub async fn close_preview(this: Instance<Self>, preview: u32) -> Result<(), JsError> {
        let preview = this.with(|native| native.preview(preview))?;
        preview.close().map_err(into_js)
    }

    /// Starts a recording on the device `device`.
    pub async fn start_recording(
        this: Instance<Self>,
        device: u32,
        options: Option<NativeRecordingOptions>,
    ) -> Result<NativeRecordingStart, JsError> {
        let found = this.with(|native| native.device(device))?;
        let options = to_recording_options(options.unwrap_or_default())?;
        let session = found.start_recording(&options).map_err(into_js)?;
        let orientation = orientation_name(session.orientation()).to_owned();
        let handle = this.with(|native| {
            let mut handles = native.handles();
            let handle = handles.next_handle();
            handles.recordings.insert(handle, Arc::new(session));
            handle
        });
        Ok(NativeRecordingStart {
            handle,
            orientation,
        })
    }

    /// The orientation the recording `recording` holds right now.
    pub async fn recording_orientation(
        this: Instance<Self>,
        recording: u32,
    ) -> Result<String, JsError> {
        let session = this.with(|native| native.recording(recording))?;
        Ok(orientation_name(session.orientation()).to_owned())
    }

    /// Finishes the recording `recording` and answers its bytes.
    pub async fn stop_recording(
        this: Instance<Self>,
        recording: u32,
    ) -> Result<NativeRecording, JsError> {
        let session = this.with(|native| native.recording(recording))?;
        Ok(native_recording(session.stop().map_err(into_js)?))
    }

    /// Abandons the recording `recording`.
    pub async fn cancel_recording(this: Instance<Self>, recording: u32) -> Result<(), JsError> {
        let session = this.with(|native| native.recording(recording))?;
        session.cancel().map_err(into_js)
    }

    /// Closes the device `device`.
    pub async fn close_device(this: Instance<Self>, device: u32) -> Result<(), JsError> {
        let device = this.with(|native| native.device(device))?;
        device.close().map_err(into_js)
    }
}

impl NativeCamera {
    // Locks span one lookup or insert and never wrap a backend call.
    fn handles(&self) -> MutexGuard<'_, Handles> {
        self.handles.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn device(&self, handle: u32) -> Result<Arc<CameraDevice>, JsError> {
        self.handles()
            .devices
            .get(&handle)
            .cloned()
            .ok_or_else(unknown_handle)
    }

    fn preview(&self, handle: u32) -> Result<Arc<PreviewStream>, JsError> {
        self.handles()
            .previews
            .get(&handle)
            .cloned()
            .ok_or_else(unknown_handle)
    }

    fn recording(&self, handle: u32) -> Result<Arc<RecordingSession>, JsError> {
        self.handles()
            .recordings
            .get(&handle)
            .cloned()
            .ok_or_else(unknown_handle)
    }
}

impl Default for NativeCamera {
    fn default() -> Self {
        Self::new()
    }
}

/// The error a rejection carries: its message, and the `code` apps match on.
fn into_js(error: CameraError) -> JsError {
    JsError::Error(error.kind().message().to_owned()).with_code(error.code())
}

fn invalid(message: &str) -> JsError {
    JsError::Error(message.to_owned()).with_code(ErrorKind::InvalidArgument.code())
}

fn unknown_handle() -> JsError {
    invalid("unknown handle: it was never opened by this camera")
}

fn permission_name(state: PermissionState) -> &'static str {
    match state {
        PermissionState::NotDetermined => "not-determined",
        PermissionState::Granted => "granted",
        PermissionState::Denied => "denied",
    }
}

fn position_name(position: CameraPosition) -> &'static str {
    match position {
        CameraPosition::Front => "front",
        CameraPosition::Back => "back",
        CameraPosition::External => "external",
    }
}

fn orientation_name(orientation: Orientation) -> &'static str {
    match orientation {
        Orientation::PortraitUp => "portrait-up",
        Orientation::LandscapeLeft => "landscape-left",
        Orientation::LandscapeRight => "landscape-right",
        Orientation::PortraitDown => "portrait-down",
    }
}

fn orientation_of(name: &str) -> Option<Orientation> {
    [
        Orientation::PortraitUp,
        Orientation::LandscapeLeft,
        Orientation::LandscapeRight,
        Orientation::PortraitDown,
    ]
    .into_iter()
    .find(|orientation| orientation_name(*orientation) == name)
}

/// The static name of a mime TSX sent. The empty string stays empty so the device refuses it as
/// an invalid argument; a name the platforms do not carry cannot be delivered.
fn mime_of(name: Option<String>, known: &[&'static str]) -> Result<Option<&'static str>, JsError> {
    let Some(name) = name else {
        return Ok(None);
    };
    if name.is_empty() {
        return Ok(Some(""));
    }
    known
        .iter()
        .find(|mime| **mime == name)
        .map(|mime| Some(*mime))
        .ok_or_else(|| {
            JsError::Error(ErrorKind::FormatUnsupported.message().to_owned())
                .with_code(ErrorKind::FormatUnsupported.code())
        })
}

fn resolution_of(width: Option<u32>, height: Option<u32>) -> Result<Option<Resolution>, JsError> {
    match (width, height) {
        (None, None) => Ok(None),
        (Some(width), Some(height)) => Ok(Some(Resolution { width, height })),
        _ => Err(invalid("width and height go together")),
    }
}

fn to_photo_options(options: NativePhotoOptions) -> Result<PhotoOptions, JsError> {
    Ok(PhotoOptions {
        resolution: resolution_of(options.width, options.height)?,
        mime: mime_of(options.mime, &["image/jpeg", "image/heif"])?,
    })
}

fn to_recording_options(options: NativeRecordingOptions) -> Result<RecordingOptions, JsError> {
    let orientation = match options.orientation.as_deref() {
        None => None,
        Some(name) => Some(orientation_of(name).ok_or_else(|| {
            invalid(
                "orientation must be \"portrait-up\", \"landscape-left\", \"landscape-right\" \
                 or \"portrait-down\"",
            )
        })?),
    };
    Ok(RecordingOptions {
        resolution: resolution_of(options.width, options.height)?,
        fps: options.fps,
        mime: mime_of(options.mime, &["video/mp4"])?,
        audio: options.audio.unwrap_or(false),
        orientation,
    })
}

fn native_info(info: CameraInfo) -> NativeCameraInfo {
    NativeCameraInfo {
        id: info.id.0,
        name: info.name,
        position: position_name(info.position).to_owned(),
    }
}

fn native_photo(photo: Photo) -> NativePhoto {
    NativePhoto {
        data: photo.data,
        mime: photo.mime.to_owned(),
        width: photo.resolution.width,
        height: photo.resolution.height,
        orientation: orientation_name(photo.orientation).to_owned(),
    }
}

fn native_recording(recording: Recording) -> NativeRecording {
    NativeRecording {
        data: recording.data,
        mime: recording.mime.to_owned(),
        width: recording.resolution.width,
        height: recording.resolution.height,
    }
}

fn native_frame(frame: Frame) -> NativeFrame {
    NativeFrame {
        data: frame.data,
        width: frame.resolution.width,
        height: frame.resolution.height,
        orientation: orientation_name(frame.orientation).to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EVERY_ORIENTATION: [(&str, Orientation); 4] = [
        ("portrait-up", Orientation::PortraitUp),
        ("landscape-left", Orientation::LandscapeLeft),
        ("landscape-right", Orientation::LandscapeRight),
        ("portrait-down", Orientation::PortraitDown),
    ];

    #[test]
    fn each_orientation_has_the_name_tsx_uses_and_back() {
        for (name, orientation) in EVERY_ORIENTATION {
            assert_eq!(orientation_name(orientation), name);
            assert_eq!(orientation_of(name), Some(orientation));
        }
        assert_eq!(orientation_of("sideways"), None);
    }

    #[test]
    fn each_permission_and_position_has_the_name_tsx_uses() {
        assert_eq!(
            permission_name(PermissionState::NotDetermined),
            "not-determined"
        );
        assert_eq!(permission_name(PermissionState::Granted), "granted");
        assert_eq!(permission_name(PermissionState::Denied), "denied");
        assert_eq!(position_name(CameraPosition::Front), "front");
        assert_eq!(position_name(CameraPosition::Back), "back");
        assert_eq!(position_name(CameraPosition::External), "external");
    }

    #[test]
    fn photo_options_keep_what_tsx_set_and_refuse_half_a_size() {
        let kept = to_photo_options(NativePhotoOptions {
            width: Some(640),
            height: Some(480),
            mime: Some("image/heif".to_owned()),
        })
        .expect("a full size and a known mime");
        assert_eq!(
            kept,
            PhotoOptions {
                resolution: Some(Resolution {
                    width: 640,
                    height: 480
                }),
                mime: Some("image/heif"),
            }
        );
        let half = NativePhotoOptions {
            width: Some(640),
            ..NativePhotoOptions::default()
        };
        assert_eq!(
            to_photo_options(half).unwrap_err(),
            invalid("width and height go together")
        );
        assert_eq!(
            to_photo_options(NativePhotoOptions::default()).ok(),
            Some(PhotoOptions::default())
        );
    }

    #[test]
    fn an_empty_mime_reaches_the_device_and_an_unknown_one_is_unsupported() {
        let empty = to_photo_options(NativePhotoOptions {
            mime: Some(String::new()),
            ..NativePhotoOptions::default()
        })
        .expect("the device refuses it, not the binding");
        assert_eq!(empty.mime, Some(""));

        let unknown = to_recording_options(NativeRecordingOptions {
            mime: Some("video/webm".to_owned()),
            ..NativeRecordingOptions::default()
        });
        assert_eq!(
            unknown.unwrap_err(),
            JsError::Error(ErrorKind::FormatUnsupported.message().to_owned())
                .with_code("ERR_CAMERA_FORMAT_UNSUPPORTED")
        );
    }

    #[test]
    fn recording_options_carry_the_locked_orientation_and_audio() {
        let options = to_recording_options(NativeRecordingOptions {
            fps: Some(30),
            audio: Some(true),
            orientation: Some("landscape-left".to_owned()),
            ..NativeRecordingOptions::default()
        })
        .expect("known values");
        assert_eq!(options.fps, Some(30));
        assert!(options.audio);
        assert_eq!(options.orientation, Some(Orientation::LandscapeLeft));

        let refused = to_recording_options(NativeRecordingOptions {
            orientation: Some("sideways".to_owned()),
            ..NativeRecordingOptions::default()
        });
        assert!(refused.is_err());
        assert!(
            !to_recording_options(NativeRecordingOptions::default())
                .expect("defaults")
                .audio
        );
    }

    #[test]
    fn an_error_keeps_its_code_and_message() {
        let js = into_js(CameraError::new(ErrorKind::DeviceBusy));
        assert_eq!(
            js,
            JsError::Error(ErrorKind::DeviceBusy.message().to_owned())
                .with_code("ERR_CAMERA_DEVICE_BUSY")
        );
    }

    #[test]
    fn results_flatten_to_plain_values() {
        let photo = native_photo(Photo {
            data: vec![1, 2, 3],
            mime: "image/jpeg",
            resolution: Resolution {
                width: 4,
                height: 3,
            },
            orientation: Orientation::LandscapeRight,
        });
        assert_eq!(photo.data, vec![1, 2, 3]);
        assert_eq!((photo.width, photo.height), (4, 3));
        assert_eq!(photo.orientation, "landscape-right");

        let info = native_info(CameraInfo {
            id: CameraId("cam-1".to_owned()),
            name: "Front".to_owned(),
            position: CameraPosition::Front,
        });
        assert_eq!(info.id, "cam-1");
        assert_eq!(info.position, "front");
    }

    #[test]
    fn a_handle_nobody_opened_is_an_invalid_argument() {
        let native = NativeCamera {
            camera: Camera::new(),
            handles: Mutex::new(Handles::default()),
        };
        assert_eq!(native.device(7).err(), Some(unknown_handle()));
        assert_eq!(native.preview(7).err(), Some(unknown_handle()));
        assert_eq!(native.recording(7).err(), Some(unknown_handle()));
    }
}
