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

/** What a `Camera` runs on: a platform bridge, or a memory backend in tests. */
export interface CameraBackend {
  /** Reports the permission state; never asks. */
  permission(): Promise<PermissionState>;
  /** Asks once; a decline settles as a coded error. */
  requestPermission(): Promise<PermissionState>;
  /** The platform's cameras, an empty array when there are none. */
  devices(): Promise<CameraInfo[]>;
  /** Opens one camera by id. */
  openDevice(id: string): Promise<CameraDeviceBackend>;
}

/** One open camera's raw seam: capture, preview, recording, close. */
export interface CameraDeviceBackend {
  capturePhoto(options?: PhotoOptions): Promise<Photo>;
  startPreview(): Promise<PreviewBackend>;
  startRecording(options?: RecordingOptions): Promise<RecordingSessionBackend>;
  close(): Promise<void>;
}

/** A live preview's raw seam. */
export interface PreviewBackend {
  /** The next frame, or a rejection when none is available. */
  nextFrame(): Promise<Frame>;
  close(): Promise<void>;
}

/** A running recording's raw seam. */
export interface RecordingSessionBackend {
  /** The orientation right now; it follows the device while the recording runs. */
  orientation(): Orientation;
  /** Finishes the recording and resolves its bytes. */
  stop(): Promise<Recording>;
  /** Drops the recording; resolves once. */
  cancel(): Promise<void>;
}
