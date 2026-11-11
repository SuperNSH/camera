import type { CameraDeviceBackend, PreviewBackend, RecordingSessionBackend } from "./backend";
import { asCameraError, cameraError } from "./errors";
import type { Frame, Orientation, Photo, PhotoOptions, Recording, RecordingOptions } from "./options";

/**
 * Runs one backend call; a backend that throws or rejects settles as a coded `CameraError`, and
 * never hangs the caller on a plain exception.
 */
export async function settle<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    throw asCameraError(error);
  }
}

/** One open camera: photos, preview and recording, each resolving exactly once. */
export class CameraDevice {
  private readonly backend: CameraDeviceBackend;
  private closed = false;
  private recordingBusy = false;

  constructor(backend: CameraDeviceBackend) {
    this.backend = backend;
  }

  /**
   * Captures a still image. An empty mime rejects with `ERR_CAMERA_INVALID_ARGUMENT` before the
   * device is touched; a format the device cannot deliver rejects with its own code.
   */
  capturePhoto(options: PhotoOptions = {}): Promise<Photo> {
    if (options.mime === "") {
      return Promise.reject(cameraError("ERR_CAMERA_INVALID_ARGUMENT"));
    }
    if (this.closed) return Promise.reject(cameraError("ERR_CAMERA_ALREADY_RESOLVED"));
    return settle(() => this.backend.capturePhoto(options));
  }

  /** Starts a live preview. Its frames come from `nextFrame` until it closes. */
  startPreview(): Promise<PreviewStream> {
    if (this.closed) return Promise.reject(cameraError("ERR_CAMERA_ALREADY_RESOLVED"));
    return settle(() => this.backend.startPreview()).then((backend) => new PreviewStream(backend));
  }

  /**
   * Starts one recording. A second while one runs rejects with `ERR_CAMERA_IN_PROGRESS`, and an
   * empty mime or a zero fps with `ERR_CAMERA_INVALID_ARGUMENT`. The first of the session's
   * `stop` or `cancel` settles it, and only then can the next recording start.
   */
  startRecording(options: RecordingOptions = {}): Promise<RecordingSession> {
    if (options.mime === "" || options.fps === 0) {
      return Promise.reject(cameraError("ERR_CAMERA_INVALID_ARGUMENT"));
    }
    if (this.closed) return Promise.reject(cameraError("ERR_CAMERA_ALREADY_RESOLVED"));
    if (this.recordingBusy) return Promise.reject(cameraError("ERR_CAMERA_IN_PROGRESS"));
    // Claimed before the call, so a second start while the first is still opening is refused too.
    this.recordingBusy = true;
    return settle(() => this.backend.startRecording(options)).then(
      (backend) => new RecordingSession(backend, () => {
        this.recordingBusy = false;
      }),
      (error: unknown) => {
        this.recordingBusy = false;
        throw error;
      },
    );
  }

  /** Closes the device. Resolves once; every later call on it rejects with `ERR_CAMERA_ALREADY_RESOLVED`. */
  close(): Promise<void> {
    if (this.closed) return Promise.reject(cameraError("ERR_CAMERA_ALREADY_RESOLVED"));
    // The first close owns the device whether the platform accepts it or not; nothing reopens.
    this.closed = true;
    return settle(() => this.backend.close());
  }
}

/** A live preview: frames on demand until it closes. */
export class PreviewStream {
  private readonly backend: PreviewBackend;
  private closed = false;

  constructor(backend: PreviewBackend) {
    this.backend = backend;
  }

  /**
   * The next frame. After close it rejects with `ERR_CAMERA_ALREADY_RESOLVED`; when no frame is
   * available, with `ERR_CAMERA_NOT_AVAILABLE`.
   */
  nextFrame(): Promise<Frame> {
    if (this.closed) return Promise.reject(cameraError("ERR_CAMERA_ALREADY_RESOLVED"));
    return settle(() => this.backend.nextFrame());
  }

  /** Closes the preview. Resolves once; a later close or `nextFrame` rejects with `ERR_CAMERA_ALREADY_RESOLVED`. */
  close(): Promise<void> {
    if (this.closed) return Promise.reject(cameraError("ERR_CAMERA_ALREADY_RESOLVED"));
    this.closed = true;
    return settle(() => this.backend.close());
  }
}

/** One running recording: the first of `stop` or `cancel` settles it, exactly once. */
export class RecordingSession {
  private readonly backend: RecordingSessionBackend;
  private readonly finish: () => void;
  private resolved = false;

  constructor(backend: RecordingSessionBackend, finish: () => void) {
    this.backend = backend;
    this.finish = finish;
  }

  /** The orientation right now. Turning the device is not an error; this reports the new value. */
  orientation(): Orientation {
    return this.backend.orientation();
  }

  /**
   * Finishes the recording. A rejection, such as an interruption, settles the session too; any
   * later `stop` or `cancel` rejects with `ERR_CAMERA_ALREADY_RESOLVED`.
   */
  stop(): Promise<Recording> {
    if (this.resolved) return Promise.reject(cameraError("ERR_CAMERA_ALREADY_RESOLVED"));
    this.resolved = true;
    return settle(() => this.backend.stop()).then(
      (recording) => {
        this.finish();
        return recording;
      },
      (error: unknown) => {
        this.finish();
        throw error;
      },
    );
  }

  /** Drops the recording. Resolves once; a later `stop` or `cancel` rejects with `ERR_CAMERA_ALREADY_RESOLVED`. */
  cancel(): Promise<void> {
    if (this.resolved) return Promise.reject(cameraError("ERR_CAMERA_ALREADY_RESOLVED"));
    this.resolved = true;
    return settle(() => this.backend.cancel()).then(
      () => this.finish(),
      (error: unknown) => {
        this.finish();
        throw error;
      },
    );
  }
}
