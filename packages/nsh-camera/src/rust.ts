import { NativeCamera } from "nsh-camera/native";
import type { CameraBackend, CameraDeviceBackend, PreviewBackend, RecordingSessionBackend } from "./backend";
import { asCameraError } from "./errors";
import type {
  CameraInfo,
  Frame,
  Orientation,
  PermissionState,
  Photo,
  PhotoOptions,
  Recording,
  RecordingOptions,
} from "./options";

/** What the crate answers for a photo, a frame or a recording: the size as two numbers. */
interface NativeImage {
  data: Uint8Array;
  mime: string;
  width: number;
  height: number;
  orientation: string;
}

interface NativeFrame {
  data: Uint8Array;
  width: number;
  height: number;
  orientation: string;
}

interface NativeRecording {
  data: Uint8Array;
  mime: string;
  width: number;
  height: number;
}

/**
 * The Rust crate (`nsh-camera/native`) as a backend. The app or package must list the crate under
 * `"rust"` in `nsh.json`; importing this module without it fails the bundle. No platform link is
 * wired in the crate yet, so every call rejects with `ERR_CAMERA_NOT_AVAILABLE` there.
 */
export function rustBackend(): CameraBackend {
  return new RustBackend();
}

// Made on first use, so importing the package starts nothing on the native side.
let shared: NativeCamera | undefined;

function native(): NativeCamera {
  if (shared === undefined) shared = new NativeCamera();
  return shared;
}

async function settle<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw asCameraError(error);
  }
}

/** The options the crate reads; a size is `width` and `height` together, and an unset field is left out. */
interface NativePhotoOptions {
  width?: number;
  height?: number;
  mime?: string;
}

interface NativeRecordingOptions extends NativePhotoOptions {
  fps?: number;
  audio?: boolean;
  orientation?: string;
}

function photoOptions(options: PhotoOptions): NativePhotoOptions {
  const sent: NativePhotoOptions = {};
  if (options.resolution !== undefined) {
    sent.width = options.resolution.width;
    sent.height = options.resolution.height;
  }
  if (options.mime !== undefined) sent.mime = options.mime;
  return sent;
}

function recordingOptions(options: RecordingOptions): NativeRecordingOptions {
  const sent: NativeRecordingOptions = photoOptions(options);
  if (options.fps !== undefined) sent.fps = options.fps;
  if (options.audio !== undefined) sent.audio = options.audio;
  if (options.orientation !== undefined) sent.orientation = options.orientation;
  return sent;
}

class RustBackend implements CameraBackend {
  permission(): Promise<PermissionState> {
    return settle(async () => (await native().permission()) as PermissionState);
  }

  requestPermission(): Promise<PermissionState> {
    return settle(async () => (await native().requestPermission()) as PermissionState);
  }

  devices(): Promise<CameraInfo[]> {
    return settle(async () => (await native().devices()) as CameraInfo[]);
  }

  openDevice(id: string): Promise<CameraDeviceBackend> {
    return settle(async () => new RustDevice(await native().open(id)));
  }
}

class RustDevice implements CameraDeviceBackend {
  private readonly handle: number;

  constructor(handle: number) {
    this.handle = handle;
  }

  capturePhoto(options: PhotoOptions = {}): Promise<Photo> {
    return settle(async () => {
      const photo = (await native().capturePhoto(this.handle, photoOptions(options))) as NativeImage;
      return {
        data: photo.data,
        mime: photo.mime,
        resolution: { width: photo.width, height: photo.height },
        orientation: photo.orientation as Orientation,
      };
    });
  }

  startPreview(): Promise<PreviewBackend> {
    return settle(async () => new RustPreview(await native().startPreview(this.handle)));
  }

  startRecording(options: RecordingOptions = {}): Promise<RecordingSessionBackend> {
    return settle(async () => {
      const started = (await native().startRecording(this.handle, recordingOptions(options))) as {
        handle: number;
        orientation: string;
      };
      return new RustRecording(started.handle, started.orientation as Orientation);
    });
  }

  close(): Promise<void> {
    return settle(() => native().closeDevice(this.handle));
  }
}

class RustPreview implements PreviewBackend {
  private readonly handle: number;

  constructor(handle: number) {
    this.handle = handle;
  }

  nextFrame(): Promise<Frame> {
    return settle(async () => {
      const frame = (await native().nextFrame(this.handle)) as NativeFrame;
      return {
        data: frame.data,
        resolution: { width: frame.width, height: frame.height },
        orientation: frame.orientation as Orientation,
      };
    });
  }

  close(): Promise<void> {
    return settle(() => native().closePreview(this.handle));
  }
}

class RustRecording implements RecordingSessionBackend {
  private readonly handle: number;
  private current: Orientation;

  constructor(handle: number, orientation: Orientation) {
    this.handle = handle;
    this.current = orientation;
  }

  // The session's orientation is read synchronously and the crate answers asynchronously, so this
  // returns the last orientation the crate reported and asks for the next one in the background.
  orientation(): Orientation {
    native()
      .recordingOrientation(this.handle)
      .then(
        (next) => {
          this.current = next as Orientation;
        },
        () => {
          // A finished recording has no orientation to report; the last one stands.
        },
      );
    return this.current;
  }

  stop(): Promise<Recording> {
    return settle(async () => {
      const recording = (await native().stopRecording(this.handle)) as NativeRecording;
      return {
        data: recording.data,
        mime: recording.mime,
        resolution: { width: recording.width, height: recording.height },
      };
    });
  }

  cancel(): Promise<void> {
    return settle(() => native().cancelRecording(this.handle));
  }
}
