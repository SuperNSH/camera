/** The codes a camera rejection carries. Apps match on `code`. */
export type CameraErrorCode =
  | "ERR_CAMERA_NOT_AVAILABLE"
  | "ERR_CAMERA_PERMISSION_DENIED"
  | "ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED"
  | "ERR_CAMERA_PERMISSION_RESTRICTED"
  | "ERR_CAMERA_MIC_PERMISSION_DENIED"
  | "ERR_CAMERA_DEVICE_BUSY"
  | "ERR_CAMERA_FORMAT_UNSUPPORTED"
  | "ERR_CAMERA_IN_PROGRESS"
  | "ERR_CAMERA_INTERRUPTED"
  | "ERR_CAMERA_ORIENTATION_UNSUPPORTED"
  | "ERR_CAMERA_CANCELLED"
  | "ERR_CAMERA_BACKEND"
  | "ERR_CAMERA_INVALID_ARGUMENT"
  | "ERR_CAMERA_ALREADY_RESOLVED";

/** Same wording as the Rust crate's messages. None holds the reason text. */
const MESSAGES: Record<CameraErrorCode, string> = {
  ERR_CAMERA_NOT_AVAILABLE:
    "No camera matches here: no device, an unknown id, or no capture service on this platform.",
  ERR_CAMERA_PERMISSION_DENIED: "The camera permission was declined. Grant it in the system settings.",
  ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED:
    "The camera permission was permanently declined. Only the system settings can grant it.",
  ERR_CAMERA_PERMISSION_RESTRICTED:
    "The camera permission is restricted, for example by parental controls, and cannot be requested.",
  ERR_CAMERA_MIC_PERMISSION_DENIED:
    "The microphone permission was declined, and the recording asked for audio.",
  ERR_CAMERA_DEVICE_BUSY: "The camera is in use by another app or process.",
  ERR_CAMERA_FORMAT_UNSUPPORTED:
    "The device cannot deliver the requested format, resolution, or frame rate.",
  ERR_CAMERA_IN_PROGRESS: "Another recording is already running on this device.",
  ERR_CAMERA_INTERRUPTED: "The recording was interrupted, for example by backgrounding the app or a phone call.",
  ERR_CAMERA_ORIENTATION_UNSUPPORTED: "This platform cannot honor the requested recording orientation.",
  ERR_CAMERA_CANCELLED: "The recording was cancelled before it finished.",
  ERR_CAMERA_BACKEND: "The platform's camera service failed.",
  ERR_CAMERA_INVALID_ARGUMENT: "An argument is empty or not allowed on this platform.",
  ERR_CAMERA_ALREADY_RESOLVED: "The operation already resolved; it cannot resolve again.",
};

/** A rejection of the camera API. `code` is the stable name; the message says what to do. */
export class CameraError extends Error {
  readonly code: CameraErrorCode;

  constructor(code: CameraErrorCode) {
    super(MESSAGES[code]);
    this.name = "CameraError";
    this.code = code;
  }
}

/** The error for a known code. */
export function cameraError(code: CameraErrorCode): CameraError {
  return new CameraError(code);
}

const KNOWN = new Set<string>(Object.keys(MESSAGES));

/**
 * Turns whatever a backend or the native side threw into a coded `CameraError`. A rejection from
 * the Rust crate carries its `code`; a host's carries `ERR_NSH_HOST_ERROR` and starts its message
 * with the code, as `ERR_CAMERA_DEVICE_BUSY: text`. Anything unknown is a backend failure.
 */
export function asCameraError(error: unknown): CameraError {
  if (error instanceof CameraError) return error;
  const raw = (error ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof raw.code === "string" ? raw.code : "";
  const message = typeof raw.message === "string" ? raw.message : "";
  if (code === "ERR_NSH_HOST_ERROR") {
    const named = /^(ERR_CAMERA_[A-Z_]+): /.exec(message)?.[1];
    return named !== undefined && KNOWN.has(named)
      ? cameraError(named as CameraErrorCode)
      : cameraError("ERR_CAMERA_BACKEND");
  }
  return KNOWN.has(code) ? cameraError(code as CameraErrorCode) : cameraError("ERR_CAMERA_BACKEND");
}
