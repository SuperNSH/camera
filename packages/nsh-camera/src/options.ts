/** Which way a camera faces, as the platforms name it. */
export type CameraPosition = "front" | "back" | "external";

/** The camera permission. A restricted device reports "denied" and rejects requests with its own code. */
export type PermissionState = "not-determined" | "granted" | "denied";

/** An orientation, as the platforms name it. */
export type Orientation = "portrait-up" | "landscape-left" | "landscape-right" | "portrait-down";

/** One camera the platform reports. */
export interface CameraInfo {
  /** The platform's stable id, the one `open` takes. */
  id: string;
  /** The system's name for the camera. */
  name: string;
  /** Which way it faces. */
  position: CameraPosition;
}

/** Pixel dimensions. */
export interface Resolution {
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
}

/** The options of one capture, with the camera plugins' names where they have them. */
export interface PhotoOptions {
  /** The size to shoot at; omitted follows the device. */
  resolution?: Resolution;
  /** `image/jpeg` when omitted; `image/heif` is the other value the platforms name. */
  mime?: string;
}

/** A captured still image. */
export interface Photo {
  /** The encoded bytes. */
  data: Uint8Array;
  /** What `data` holds. */
  mime: string;
  /** The size the device delivered. */
  resolution: Resolution;
  /** How the sensor was held. */
  orientation: Orientation;
}

/** The options of one recording. */
export interface RecordingOptions {
  /** The size to record at; omitted follows the device. */
  resolution?: Resolution;
  /** Frames per second; omitted follows the device. */
  fps?: number;
  /** `video/mp4` when omitted. */
  mime?: string;
  /** Records audio too. Defaults false; a declined microphone rejects the start. */
  audio?: boolean;
  /** Omitted follows the device; a set orientation locks it where the platform can honor it. */
  orientation?: Orientation;
}

/** A finished recording. */
export interface Recording {
  /** The encoded bytes. */
  data: Uint8Array;
  /** What `data` holds. */
  mime: string;
  /** The size the device delivered. */
  resolution: Resolution;
}

/** One preview frame. */
export interface Frame {
  /** The frame's bytes. */
  data: Uint8Array;
  /** The frame's size. */
  resolution: Resolution;
  /** How the sensor was held. */
  orientation: Orientation;
}
