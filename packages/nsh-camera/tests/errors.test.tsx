import { expect, test } from "nsh/test";
import { CameraError, asCameraError, cameraError, type CameraErrorCode } from "../src";

/** One entry per code in the union: a missing or invented code fails to type-check. */
const MESSAGES: Record<CameraErrorCode, string> = {
  ERR_CAMERA_NOT_AVAILABLE: "No camera matches here: no device, an unknown id, or no capture service on this platform.",
  ERR_CAMERA_PERMISSION_DENIED: "The camera permission was declined. Grant it in the system settings.",
  ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED:
    "The camera permission was permanently declined. Only the system settings can grant it.",
  ERR_CAMERA_PERMISSION_RESTRICTED:
    "The camera permission is restricted, for example by parental controls, and cannot be requested.",
  ERR_CAMERA_MIC_PERMISSION_DENIED: "The microphone permission was declined, and the recording asked for audio.",
  ERR_CAMERA_DEVICE_BUSY: "The camera is in use by another app or process.",
  ERR_CAMERA_FORMAT_UNSUPPORTED: "The device cannot deliver the requested format, resolution, or frame rate.",
  ERR_CAMERA_IN_PROGRESS: "Another recording is already running on this device.",
  ERR_CAMERA_INTERRUPTED: "The recording was interrupted, for example by backgrounding the app or a phone call.",
  ERR_CAMERA_ORIENTATION_UNSUPPORTED: "This platform cannot honor the requested recording orientation.",
  ERR_CAMERA_CANCELLED: "The recording was cancelled before it finished.",
  ERR_CAMERA_BACKEND: "The platform's camera service failed.",
  ERR_CAMERA_INVALID_ARGUMENT: "An argument is empty or not allowed on this platform.",
  ERR_CAMERA_ALREADY_RESOLVED: "The operation already resolved; it cannot resolve again.",
};

const CODES = Object.keys(MESSAGES) as CameraErrorCode[];

test("every code carries its locked sentence", () => {
  expect(CODES.length).toBe(14);
  for (const code of CODES) {
    const err = cameraError(code);
    expect(err instanceof CameraError).toBe(true);
    expect(err.name).toBe("CameraError");
    expect(err.code).toBe(code);
    expect(err.message).toBe(MESSAGES[code]);
  }
});

test("asCameraError passes a CameraError through unchanged", () => {
  const err = cameraError("ERR_CAMERA_DEVICE_BUSY");
  expect(asCameraError(err)).toBe(err);
});

test("asCameraError maps an unknown throw to a backend failure", () => {
  const mapped = asCameraError(new Error("boom"));
  expect(mapped instanceof CameraError).toBe(true);
  expect(mapped.code).toBe("ERR_CAMERA_BACKEND");
  expect(asCameraError("not an error").code).toBe("ERR_CAMERA_BACKEND");
});
