import type { CameraBackend } from "./backend";
import { CameraDevice, settle } from "./device";
import { cameraError } from "./errors";
import type { CameraInfo, PermissionState } from "./options";

/**
 * Photo capture, video recording and live preview. It runs on the platform's camera service
 * unless it is given another backend, and each call resolves exactly once.
 */
export class Camera {
  private readonly backend: CameraBackend;

  constructor(options: { backend?: CameraBackend } = {}) {
    this.backend = options.backend ?? unwiredBackend();
  }

  /** Reports the permission state; never asks. */
  permission(): Promise<PermissionState> {
    return settle(() => this.backend.permission());
  }

  /** Asks once; a decline settles as a coded error and the state stays denied. */
  requestPermission(): Promise<PermissionState> {
    return settle(() => this.backend.requestPermission());
  }

  /** The platform's cameras, an empty array when there are none. */
  devices(): Promise<CameraInfo[]> {
    return settle(() => this.backend.devices());
  }

  /**
   * Opens one camera by id. An empty id rejects with `ERR_CAMERA_INVALID_ARGUMENT`, an id no
   * device has with `ERR_CAMERA_NOT_AVAILABLE`, and a camera held elsewhere with its busy code.
   */
  open(id: string): Promise<CameraDevice> {
    if (id === "") return Promise.reject(cameraError("ERR_CAMERA_INVALID_ARGUMENT"));
    return settle(() => this.backend.openDevice(id)).then((backend) => new CameraDevice(backend));
  }
}

/**
 * No native camera link ships this release; every ask names it, and the permission probe reports
 * not-determined because nothing was ever asked.
 */
function unwiredBackend(): CameraBackend {
  const missing = <T>(): Promise<T> => Promise.reject(cameraError("ERR_CAMERA_NOT_AVAILABLE"));
  return {
    permission: async (): Promise<PermissionState> => "not-determined",
    requestPermission: missing,
    devices: missing,
    openDevice: missing,
  };
}
