import type { CameraBackend, CameraDeviceBackend, PreviewBackend, RecordingSessionBackend } from "./backend";
import { cameraError, type CameraErrorCode } from "./errors";
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

/** The state a memory backend starts from: nothing granted, no devices. */
export interface MemoryCameraConfig {
  /** The devices `devices` reports and `openDevice` accepts. Defaults to none. */
  devices?: CameraInfo[];
  /** The state `permission` reports before the first request. Defaults to "not-determined". */
  permission?: PermissionState;
}

/** A device the test scripts: it answers photos, frames and recordings from the shared state. */
export interface MemoryDevice extends CameraDeviceBackend {
  /** Arms the next capture to reject with `code`. */
  failCaptureWith(code: CameraErrorCode): void;
  /** Arms the next recording start to reject with `code`. */
  failRecordingWith(code: CameraErrorCode): void;
  /** Arms the next stop to reject with `ERR_CAMERA_INTERRUPTED`, as an interruption would. */
  interruptRecording(): void;
  /** Arms the next stop to reject with `code`. */
  failStopWith(code: CameraErrorCode): void;
  /** Makes a `startRecording` that asks for audio reject with the microphone code. */
  denyMicrophone(): void;
  /** Queues a photo; captures hand these out in order before synthesizing one. */
  queuePhoto(photo: Photo): void;
  /** Sets the frames the preview hands out, in order. */
  queueFrames(frames: Frame[]): void;
  /** Sets the orientation `orientation` reports; a running session follows it. */
  setOrientation(orientation: Orientation): void;
  /** Sets the bytes the next finished recording resolves. */
  queueRecordingData(data: Uint8Array): void;
}

/** A backend the test scripts, for tests and for apps that run without a camera. */
export interface MemoryCamera extends CameraBackend {
  /** Opens a scripted device; the id must be one `devices` reports. */
  openDevice(id: string): Promise<MemoryDevice>;
  /** Grants the camera permission. */
  grantPermission(): void;
  /** Declines the next request once; a decline denies the permission permanently. */
  denyPermissionOnce(): void;
  /** Denies the permission without asking; later requests name it permanently denied. */
  denyPermissionPermanently(): void;
  /** Marks the camera restricted: `permission` reports "denied", requests reject with their own code. */
  restrictPermission(): void;
  /** Replaces the device list. */
  withDevices(devices: CameraInfo[]): void;
  /** Arms the next open to reject with `code`. */
  failOpenWith(code: CameraErrorCode): void;
  /** Makes a `startRecording` that asks for audio reject with the microphone code. */
  denyMicrophone(): void;
  /** Queues a photo; captures hand these out in order before synthesizing one. */
  queuePhoto(photo: Photo): void;
  /** Arms the next capture to reject with `code`. */
  failCaptureWith(code: CameraErrorCode): void;
  /** Sets the frames the preview hands out, in order. */
  queueFrames(frames: Frame[]): void;
  /** Sets the orientation `orientation` reports; a running session follows it. */
  setOrientation(orientation: Orientation): void;
  /** Arms the next recording start to reject with `code`. */
  failRecordingWith(code: CameraErrorCode): void;
  /** Arms the next stop to reject with `ERR_CAMERA_INTERRUPTED`, as an interruption would. */
  interruptRecording(): void;
  /** Arms the next stop to reject with `code`. */
  failStopWith(code: CameraErrorCode): void;
  /** Sets the bytes the next finished recording resolves. */
  queueRecordingData(data: Uint8Array): void;
  /** How many recordings started on this backend's devices. */
  recordings(): number;
  /** How many times a device of this backend was closed. */
  closes(): number;
}

/** One scripted backend state, shared by the backend and every device it opens. */
interface MemoryState {
  permission: PermissionState;
  denyNextAsk: boolean;
  restricted: boolean;
  devices: CameraInfo[];
  failOpen: CameraErrorCode | null;
  microphoneDenied: boolean;
  photos: Photo[];
  failCapture: CameraErrorCode | null;
  frames: Frame[];
  orientation: Orientation;
  failRecording: CameraErrorCode | null;
  failStop: CameraErrorCode | null;
  recordingData: Uint8Array | null;
  recordings: number;
  closes: number;
}

/** A memory backend, for tests and for apps that run without a camera. */
export function memoryBackend(config: MemoryCameraConfig = {}): MemoryCamera {
  const state: MemoryState = {
    permission: config.permission ?? "not-determined",
    denyNextAsk: false,
    restricted: false,
    devices: config.devices === undefined ? [] : [...config.devices],
    failOpen: null,
    microphoneDenied: false,
    photos: [],
    failCapture: null,
    frames: [],
    orientation: "portrait-up",
    failRecording: null,
    failStop: null,
    recordingData: null,
    recordings: 0,
    closes: 0,
  };

  const makeDevice = (): MemoryDevice => {
    let closed = false;
    let recordingActive = false;

    const makePreview = (): PreviewBackend => {
      let previewClosed = false;
      return {
        nextFrame: async () => {
          if (previewClosed) throw cameraError("ERR_CAMERA_ALREADY_RESOLVED");
          const frame = state.frames.shift();
          if (frame === undefined) throw cameraError("ERR_CAMERA_NOT_AVAILABLE");
          return frame;
        },
        close: async () => {
          if (previewClosed) throw cameraError("ERR_CAMERA_ALREADY_RESOLVED");
          previewClosed = true;
        },
      };
    };

    return {
      capturePhoto: async (options: PhotoOptions = {}) => {
        if (options.mime === "") {
          throw cameraError("ERR_CAMERA_INVALID_ARGUMENT");
        }
        if (closed) throw cameraError("ERR_CAMERA_ALREADY_RESOLVED");
        if (state.failCapture !== null) {
          const code = state.failCapture;
          state.failCapture = null;
          throw cameraError(code);
        }
        const queued = state.photos.shift();
        if (queued !== undefined) return queued;
        return {
          data: new Uint8Array(0),
          mime: options.mime ?? "image/jpeg",
          resolution: options.resolution ?? { width: 1920, height: 1080 },
          orientation: "portrait-up",
        };
      },
      startPreview: async () => {
        if (closed) throw cameraError("ERR_CAMERA_ALREADY_RESOLVED");
        return makePreview();
      },
      startRecording: async (options: RecordingOptions = {}): Promise<RecordingSessionBackend> => {
        if (options.mime === "" || options.fps === 0) {
          throw cameraError("ERR_CAMERA_INVALID_ARGUMENT");
        }
        if (closed) throw cameraError("ERR_CAMERA_ALREADY_RESOLVED");
        if (recordingActive) throw cameraError("ERR_CAMERA_IN_PROGRESS");
        if (options.audio === true && state.microphoneDenied) {
          throw cameraError("ERR_CAMERA_MIC_PERMISSION_DENIED");
        }
        if (state.failRecording !== null) {
          const code = state.failRecording;
          state.failRecording = null;
          throw cameraError(code);
        }
        state.recordings += 1;
        recordingActive = true;
        return {
          orientation: () => state.orientation,
          stop: async (): Promise<Recording> => {
            recordingActive = false;
            if (state.failStop !== null) {
              const code = state.failStop;
              state.failStop = null;
              throw cameraError(code);
            }
            const data = state.recordingData;
            state.recordingData = null;
            return {
              data: data ?? new Uint8Array(0),
              mime: options.mime ?? "video/mp4",
              resolution: options.resolution ?? { width: 1920, height: 1080 },
            };
          },
          cancel: async (): Promise<void> => {
            recordingActive = false;
          },
        };
      },
      close: async () => {
        if (closed) throw cameraError("ERR_CAMERA_ALREADY_RESOLVED");
        closed = true;
        state.closes += 1;
      },
      failCaptureWith: (code: CameraErrorCode) => {
        state.failCapture = code;
      },
      failRecordingWith: (code: CameraErrorCode) => {
        state.failRecording = code;
      },
      interruptRecording: () => {
        state.failStop = "ERR_CAMERA_INTERRUPTED";
      },
      failStopWith: (code: CameraErrorCode) => {
        state.failStop = code;
      },
      denyMicrophone: () => {
        state.microphoneDenied = true;
      },
      queuePhoto: (photo: Photo) => {
        state.photos.push(photo);
      },
      queueFrames: (frames: Frame[]) => {
        state.frames = [...frames];
      },
      setOrientation: (orientation: Orientation) => {
        state.orientation = orientation;
      },
      queueRecordingData: (data: Uint8Array) => {
        state.recordingData = data;
      },
    };
  };

  return {
    permission: async (): Promise<PermissionState> => (state.restricted ? "denied" : state.permission),
    requestPermission: async (): Promise<PermissionState> => {
      if (state.restricted) throw cameraError("ERR_CAMERA_PERMISSION_RESTRICTED");
      if (state.permission === "denied") throw cameraError("ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED");
      if (state.denyNextAsk) {
        state.denyNextAsk = false;
        state.permission = "denied";
        throw cameraError("ERR_CAMERA_PERMISSION_DENIED");
      }
      state.permission = "granted";
      return "granted";
    },
    devices: async () => [...state.devices],
    openDevice: async (id: string): Promise<MemoryDevice> => {
      if (id === "") throw cameraError("ERR_CAMERA_INVALID_ARGUMENT");
      if (state.devices.every((info) => info.id !== id)) throw cameraError("ERR_CAMERA_NOT_AVAILABLE");
      if (state.failOpen !== null) {
        const code = state.failOpen;
        state.failOpen = null;
        throw cameraError(code);
      }
      return makeDevice();
    },
    grantPermission: () => {
      state.permission = "granted";
      state.denyNextAsk = false;
      state.restricted = false;
    },
    denyPermissionOnce: () => {
      state.denyNextAsk = true;
    },
    denyPermissionPermanently: () => {
      state.permission = "denied";
      state.denyNextAsk = false;
    },
    restrictPermission: () => {
      state.restricted = true;
    },
    withDevices: (devices: CameraInfo[]) => {
      state.devices = [...devices];
    },
    failOpenWith: (code: CameraErrorCode) => {
      state.failOpen = code;
    },
    denyMicrophone: () => {
      state.microphoneDenied = true;
    },
    queuePhoto: (photo: Photo) => {
      state.photos.push(photo);
    },
    failCaptureWith: (code: CameraErrorCode) => {
      state.failCapture = code;
    },
    queueFrames: (frames: Frame[]) => {
      state.frames = [...frames];
    },
    setOrientation: (orientation: Orientation) => {
      state.orientation = orientation;
    },
    failRecordingWith: (code: CameraErrorCode) => {
      state.failRecording = code;
    },
    interruptRecording: () => {
      state.failStop = "ERR_CAMERA_INTERRUPTED";
    },
    failStopWith: (code: CameraErrorCode) => {
      state.failStop = code;
    },
    queueRecordingData: (data: Uint8Array) => {
      state.recordingData = data;
    },
    recordings: () => state.recordings,
    closes: () => state.closes,
  };
}
