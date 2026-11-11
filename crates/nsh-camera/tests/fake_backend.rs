use std::sync::Arc;

use nsh_camera::{
    Camera, CameraDevice, CameraError, CameraId, CameraInfo, CameraPosition, ErrorKind,
    FakeBackend, Frame, Orientation, PermissionState, Photo, PhotoOptions, RecordingOptions,
    Resolution,
};

fn back_id() -> CameraId {
    CameraId("back".to_string())
}

fn opened_device() -> (Arc<FakeBackend>, CameraDevice) {
    let backend = Arc::new(FakeBackend::new());
    backend.with_devices(vec![CameraInfo {
        id: back_id(),
        name: "Fake back camera".to_string(),
        position: CameraPosition::Back,
    }]);
    let camera = Camera::with_backend(backend.clone());
    let device = camera.open(&back_id()).expect("open the scripted device");
    (backend, device)
}

#[test]
fn scripted_happy_path_returns_the_queued_photo_and_recording_data() {
    let backend = Arc::new(FakeBackend::new());
    backend.grant_permission();
    let scripted = vec![CameraInfo {
        id: back_id(),
        name: "Fake back camera".to_string(),
        position: CameraPosition::Back,
    }];
    backend.with_devices(scripted.clone());
    let camera = Camera::with_backend(backend.clone());

    let state = camera.request_permission().expect("scripted grant");
    assert_eq!(state, PermissionState::Granted);

    let devices = camera.devices().expect("scripted device list");
    assert_eq!(devices, scripted);

    let device = camera.open(&back_id()).expect("open the scripted device");

    backend.queue_photo(Photo {
        data: vec![1, 2, 3, 4],
        mime: "image/png",
        resolution: Resolution {
            width: 1280,
            height: 720,
        },
        orientation: Orientation::PortraitUp,
    });
    let photo = device
        .capture_photo(&PhotoOptions::default())
        .expect("capture returns the queued photo");
    assert_eq!(photo.data, vec![1, 2, 3, 4]);
    assert_eq!(photo.mime, "image/png");
    assert_eq!(
        photo.resolution,
        Resolution {
            width: 1280,
            height: 720,
        }
    );
    assert_eq!(photo.orientation, Orientation::PortraitUp);

    let session = device
        .start_recording(&RecordingOptions::default())
        .expect("start recording");
    backend.queue_recording_data(vec![9, 9, 9]);
    let recording = session.stop().expect("stop returns the queued data");
    assert_eq!(recording.data, vec![9, 9, 9]);
}

#[test]
fn default_permission_grants_without_any_script() {
    let backend = Arc::new(FakeBackend::new());
    let camera = Camera::with_backend(backend.clone());

    let state = camera.request_permission().expect("default grants");
    assert_eq!(state, PermissionState::Granted);
}

#[test]
fn default_device_list_is_empty() {
    let backend = Arc::new(FakeBackend::new());
    let camera = Camera::with_backend(backend.clone());

    let devices = camera.devices().expect("no devices scripted");
    assert!(devices.is_empty());
}

#[test]
fn default_open_of_an_unknown_id_reports_not_available() {
    let backend = Arc::new(FakeBackend::new());
    let camera = Camera::with_backend(backend.clone());

    let error = camera
        .open(&CameraId("nowhere".to_string()))
        .err()
        .expect("id not in the scripted list");
    assert_eq!(error.code(), "ERR_CAMERA_NOT_AVAILABLE");
}

#[test]
fn open_failure_script_skips_unknown_ids() {
    let backend = Arc::new(FakeBackend::new());
    backend.with_devices(vec![CameraInfo {
        id: back_id(),
        name: "Fake back camera".to_string(),
        position: CameraPosition::Back,
    }]);
    backend.fail_open_with(CameraError::new(ErrorKind::DeviceBusy));
    let camera = Camera::with_backend(backend.clone());

    let unknown = camera
        .open(&CameraId("nowhere".to_string()))
        .err()
        .expect("id not in the scripted list");
    assert_eq!(unknown.code(), "ERR_CAMERA_NOT_AVAILABLE");

    let scripted = camera
        .open(&back_id())
        .err()
        .expect("the one-shot open failure stayed armed");
    assert_eq!(scripted.code(), "ERR_CAMERA_DEVICE_BUSY");
}

#[test]
fn default_capture_synthesizes_a_photo_from_the_options() {
    let (_backend, device) = opened_device();

    let requested = PhotoOptions {
        resolution: Some(Resolution {
            width: 1280,
            height: 720,
        }),
        mime: Some("image/png"),
    };
    let photo = device
        .capture_photo(&requested)
        .expect("capture with nothing queued synthesizes");
    assert!(photo.data.is_empty());
    assert_eq!(photo.mime, "image/png");
    assert_eq!(
        photo.resolution,
        Resolution {
            width: 1280,
            height: 720,
        }
    );
    assert_eq!(photo.orientation, Orientation::PortraitUp);

    let fallback = device
        .capture_photo(&PhotoOptions::default())
        .expect("defaults synthesize too");
    assert!(fallback.data.is_empty());
    assert_eq!(fallback.mime, "image/jpeg");
    assert_eq!(
        fallback.resolution,
        Resolution {
            width: 1920,
            height: 1080,
        }
    );
    assert_eq!(fallback.orientation, Orientation::PortraitUp);
}

#[test]
fn queued_photos_return_in_fifo_order() {
    let (backend, device) = opened_device();
    backend.queue_photo(Photo {
        data: vec![1],
        mime: "image/jpeg",
        resolution: Resolution {
            width: 640,
            height: 480,
        },
        orientation: Orientation::PortraitUp,
    });
    backend.queue_photo(Photo {
        data: vec![2],
        mime: "image/jpeg",
        resolution: Resolution {
            width: 640,
            height: 480,
        },
        orientation: Orientation::LandscapeLeft,
    });

    let first = device
        .capture_photo(&PhotoOptions::default())
        .expect("first queued photo");
    assert_eq!(first.data, vec![1]);
    assert_eq!(first.orientation, Orientation::PortraitUp);

    let second = device
        .capture_photo(&PhotoOptions::default())
        .expect("second queued photo");
    assert_eq!(second.data, vec![2]);
    assert_eq!(second.orientation, Orientation::LandscapeLeft);

    let drained = device
        .capture_photo(&PhotoOptions::default())
        .expect("drained queue falls back to the synthesized default");
    assert_eq!(
        drained.resolution,
        Resolution {
            width: 1920,
            height: 1080,
        }
    );
}

#[test]
fn default_stop_synthesizes_the_recording_from_the_options() {
    let (_backend, device) = opened_device();
    let options = RecordingOptions {
        resolution: Some(Resolution {
            width: 1280,
            height: 720,
        }),
        ..RecordingOptions::default()
    };
    let session = device.start_recording(&options).expect("start recording");

    let recording = session
        .stop()
        .expect("stop with nothing scripted synthesizes");
    assert!(recording.data.is_empty());
    assert_eq!(recording.mime, "video/mp4");
    assert_eq!(
        recording.resolution,
        Resolution {
            width: 1280,
            height: 720,
        }
    );
}

#[test]
fn queued_frames_pop_fifo_then_report_not_available() {
    let (backend, device) = opened_device();
    backend.queue_frames(vec![
        Frame {
            data: vec![1],
            resolution: Resolution {
                width: 640,
                height: 480,
            },
            orientation: Orientation::PortraitUp,
        },
        Frame {
            data: vec![2],
            resolution: Resolution {
                width: 640,
                height: 480,
            },
            orientation: Orientation::LandscapeLeft,
        },
    ]);
    let preview = device.start_preview().expect("start preview");

    let first = preview.next_frame().expect("first queued frame");
    assert_eq!(first.data, vec![1]);
    assert_eq!(first.orientation, Orientation::PortraitUp);

    let second = preview.next_frame().expect("second queued frame");
    assert_eq!(second.data, vec![2]);
    assert_eq!(second.orientation, Orientation::LandscapeLeft);

    let error = preview.next_frame().err().expect("empty frame queue");
    assert_eq!(error.code(), "ERR_CAMERA_NOT_AVAILABLE");
}
