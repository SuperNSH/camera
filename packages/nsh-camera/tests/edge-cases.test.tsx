import { expect, test } from "nsh/test";
import { Camera, memoryBackend } from "../src";

/** One scripted camera with its device open, the start every device scenario shares. */
async function openCamera() {
  const backend = memoryBackend();
  backend.withDevices([{ id: "cam-1", name: "Cam", position: "back" }]);
  const camera = new Camera({ backend });
  return { backend, camera, device: await camera.open("cam-1") };
}

test("permission_denied_on_ios_asks_once_then_requires_settings", async () => {
  const backend = memoryBackend();
  const camera = new Camera({ backend });
  backend.denyPermissionOnce();
  await expect(camera.requestPermission()).rejects.toMatchObject({ code: "ERR_CAMERA_PERMISSION_DENIED" });
  expect(await camera.permission()).toBe("denied");
  await expect(camera.requestPermission()).rejects.toMatchObject({
    code: "ERR_CAMERA_PERMISSION_PERMANENTLY_DENIED",
  });
});

test("restricted_permission_maps_to_permission_restricted", async () => {
  const backend = memoryBackend();
  const camera = new Camera({ backend });
  backend.restrictPermission();
  await expect(camera.requestPermission()).rejects.toMatchObject({ code: "ERR_CAMERA_PERMISSION_RESTRICTED" });
  expect(await camera.permission()).toBe("denied");
});

test("simulator_without_camera_reports_not_available", async () => {
  const camera = new Camera({ backend: memoryBackend() });
  expect(await camera.devices()).toEqual([]);
  await expect(camera.open("any")).rejects.toMatchObject({ code: "ERR_CAMERA_NOT_AVAILABLE" });
});

test("device_busy_reports_device_busy", async () => {
  const backend = memoryBackend();
  backend.withDevices([{ id: "cam-1", name: "Cam", position: "back" }]);
  const camera = new Camera({ backend });
  backend.failOpenWith("ERR_CAMERA_DEVICE_BUSY");
  await expect(camera.open("cam-1")).rejects.toMatchObject({ code: "ERR_CAMERA_DEVICE_BUSY" });
});

test("mic_permission_denied_fails_recording_with_audio", async () => {
  const { backend, device } = await openCamera();
  backend.denyMicrophone();
  await expect(device.startRecording({ audio: true })).rejects.toMatchObject({
    code: "ERR_CAMERA_MIC_PERMISSION_DENIED",
  });
  expect(backend.recordings()).toBe(0);
  const silent = await device.startRecording();
  await silent.cancel();
});

test("orientation_change_while_recording_updates_session", async () => {
  const { backend, device } = await openCamera();
  const session = await device.startRecording();
  backend.setOrientation("landscape-left");
  expect(session.orientation()).toBe("landscape-left");
  await session.stop();
});

test("orientation_lock_platform_cannot_honor_is_orientation_unsupported", async () => {
  const { backend, device } = await openCamera();
  backend.failRecordingWith("ERR_CAMERA_ORIENTATION_UNSUPPORTED");
  await expect(device.startRecording({ orientation: "portrait-down" })).rejects.toMatchObject({
    code: "ERR_CAMERA_ORIENTATION_UNSUPPORTED",
  });
});

test("backgrounded_interruption_resolves_recording_as_interrupted", async () => {
  const { backend, device } = await openCamera();
  const session = await device.startRecording();
  backend.interruptRecording();
  await expect(session.stop()).rejects.toMatchObject({ code: "ERR_CAMERA_INTERRUPTED" });
  await expect(session.cancel()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
});

test("caller_cancel_resolves_recording_as_cancelled", async () => {
  const { device } = await openCamera();
  const session = await device.startRecording();
  await session.cancel();
  await expect(session.stop()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
});

test("second_recording_while_first_runs_is_in_progress", async () => {
  const { device } = await openCamera();
  const session = await device.startRecording();
  await expect(device.startRecording()).rejects.toMatchObject({ code: "ERR_CAMERA_IN_PROGRESS" });
  await session.stop();
});

test("unsupported_format_reports_format_unsupported", async () => {
  const { backend, device } = await openCamera();
  backend.failCaptureWith("ERR_CAMERA_FORMAT_UNSUPPORTED");
  await expect(device.capturePhoto()).rejects.toMatchObject({ code: "ERR_CAMERA_FORMAT_UNSUPPORTED" });
});

test("closed_preview_has_no_frames", async () => {
  const { device } = await openCamera();
  const preview = await device.startPreview();
  await preview.close();
  await expect(preview.nextFrame()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
  await expect(preview.close()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
});

test("invalid_arguments_report_invalid_argument", async () => {
  const camera = new Camera({ backend: memoryBackend() });
  await expect(camera.open("")).rejects.toMatchObject({ code: "ERR_CAMERA_INVALID_ARGUMENT" });
  const { device } = await openCamera();
  await expect(device.startRecording({ mime: "" })).rejects.toMatchObject({
    code: "ERR_CAMERA_INVALID_ARGUMENT",
  });
  await expect(device.startRecording({ fps: 0 })).rejects.toMatchObject({
    code: "ERR_CAMERA_INVALID_ARGUMENT",
  });
  await device.close();
  // Arguments are checked before the closed state, same as Rust.
  await expect(device.capturePhoto({ mime: "" })).rejects.toMatchObject({
    code: "ERR_CAMERA_INVALID_ARGUMENT",
  });
  await expect(device.startRecording({ fps: 0 })).rejects.toMatchObject({
    code: "ERR_CAMERA_INVALID_ARGUMENT",
  });
});
