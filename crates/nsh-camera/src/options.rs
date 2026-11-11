//! The cameras a device lists, and the options and results of captures and recordings.

/// Where a camera sits on the device, as the platform names it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CameraPosition {
    /// Faces the user.
    Front,
    /// Faces away from the user.
    Back,
    /// Detachable or networked, not built into the device.
    External,
}

/// The camera permission as the platform reports it.
///
/// A restricted permission (parental controls) reports [`PermissionState::Denied`]; asking for
/// it fails with `ERR_CAMERA_PERMISSION_RESTRICTED`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PermissionState {
    /// The platform has not been asked yet.
    NotDetermined,
    /// The permission holds.
    Granted,
    /// The permission was declined.
    Denied,
}

/// A sensor orientation. Recordings lock it at start; photos report what the sensor held.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Orientation {
    /// Upright with the home button or connector down.
    PortraitUp,
    /// Rotated a quarter turn left.
    LandscapeLeft,
    /// Rotated a quarter turn right.
    LandscapeRight,
    /// Upside down.
    PortraitDown,
}

/// A camera's id, exactly as `devices` reported it. Opaque and platform-specific.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CameraId(pub String);

/// One camera from `devices`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CameraInfo {
    /// The id `open` takes.
    pub id: CameraId,
    /// The platform's name for the camera.
    pub name: String,
    /// Where the camera sits.
    pub position: CameraPosition,
}

/// A pixel size.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}

/// The options of one photo.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PhotoOptions {
    /// The size to ask for; `None` lets the device pick.
    pub resolution: Option<Resolution>,
    /// `None` means `image/jpeg`; `heif` is the other name the platforms carry.
    pub mime: Option<&'static str>,
}

/// One captured photo, in memory; file IO is the app's job.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Photo {
    /// The encoded bytes.
    pub data: Vec<u8>,
    /// How `data` is encoded.
    pub mime: &'static str,
    /// The size the platform delivered.
    pub resolution: Resolution,
    /// The orientation the sensor held at capture.
    pub orientation: Orientation,
}

/// The options of one recording.
///
/// `mime` `None` means `video/mp4`. `orientation` `None` follows the device; a locked
/// orientation a platform cannot honor fails the start with `ERR_CAMERA_ORIENTATION_UNSUPPORTED`.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RecordingOptions {
    /// The size to ask for; `None` lets the device pick.
    pub resolution: Option<Resolution>,
    /// The frame rate to ask for; `None` lets the device pick.
    pub fps: Option<u32>,
    /// `None` means `video/mp4`.
    pub mime: Option<&'static str>,
    /// Whether the recording also captures the microphone. Defaults to false.
    pub audio: bool,
    /// `None` follows the device; a locked orientation pins it for the whole recording.
    pub orientation: Option<Orientation>,
}

/// One finished recording, in memory; file IO is the app's job.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Recording {
    /// The encoded bytes.
    pub data: Vec<u8>,
    /// How `data` is encoded.
    pub mime: &'static str,
    /// The size the platform delivered.
    pub resolution: Resolution,
}

/// One preview frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Frame {
    /// The frame's bytes.
    pub data: Vec<u8>,
    /// The frame's size.
    pub resolution: Resolution,
    /// The orientation the sensor held when the frame landed.
    pub orientation: Orientation,
}
