import { expect, test } from "nsh/test";
import { Camera, memoryBackend } from "../src";

/** One scripted camera with its device open, the start every device test shares. */
async function openDevice() {
  const backend = memoryBackend();
  backend.withDevices([{ id: "cam-1", name: "Cam", position: "back" }]);
  const camera = new Camera({ backend });
  return { backend, device: await camera.open("cam-1") };
}

test("capturePhoto resolves the queued photo", async () => {
  const { backend, device } = await openDevice();
  backend.queuePhoto({
    data: new Uint8Array([7, 7, 7]),
    mime: "image/png",
    resolution: { width: 640, height: 480 },
    orientation: "landscape-left",
  });
  const photo = await device.capturePhoto();
  expect(photo.mime).toBe("image/png");
  expect(photo.resolution).toEqual({ width: 640, height: 480 });
  expect(photo.orientation).toBe("landscape-left");
  expect(photo.data.length).toBe(3);
  expect(photo.data[0]).toBe(7);
});

test("capturePhoto with nothing queued synthesizes a portrait photo", async () => {
  const { device } = await openDevice();
  const asked = await device.capturePhoto({ resolution: { width: 1280, height: 720 } });
  expect(asked.resolution).toEqual({ width: 1280, height: 720 });
  expect(asked.orientation).toBe("portrait-up");
  expect(asked.data.length).toBe(0);
  const plain = await device.capturePhoto();
  expect(plain.resolution).toEqual({ width: 1920, height: 1080 });
});

test("one recording at a time, and a finished session frees the device", async () => {
  const { backend, device } = await openDevice();
  const session = await device.startRecording();
  await expect(device.startRecording()).rejects.toMatchObject({ code: "ERR_CAMERA_IN_PROGRESS" });
  expect(backend.recordings()).toBe(1);
  await session.stop();
  expect(backend.recordings()).toBe(1);
  const next = await device.startRecording();
  expect(backend.recordings()).toBe(2);
  await next.cancel();
});

test("stop resolves the session once, and later stop or cancel report already resolved", async () => {
  const { backend, device } = await openDevice();
  const session = await device.startRecording();
  backend.queueRecordingData(new Uint8Array([5, 6]));
  const recording = await session.stop();
  expect(recording.data.length).toBe(2);
  await expect(session.stop()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
  await expect(session.cancel()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
  expect(backend.recordings()).toBe(1);
});

test("cancel resolves the session once, and a later stop reports already resolved", async () => {
  const { device } = await openDevice();
  const session = await device.startRecording();
  await session.cancel();
  await expect(session.stop()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
  await expect(session.cancel()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
});

test("an interrupted recording rejects stop and counts as resolved", async () => {
  const { backend, device } = await openDevice();
  const session = await device.startRecording();
  backend.interruptRecording();
  await expect(session.stop()).rejects.toMatchObject({ code: "ERR_CAMERA_INTERRUPTED" });
  await expect(session.cancel()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
});

test("preview hands out queued frames until the queue runs dry", async () => {
  const { backend, device } = await openDevice();
  backend.queueFrames([
    { data: new Uint8Array([1]), resolution: { width: 640, height: 480 }, orientation: "portrait-up" },
    { data: new Uint8Array([2]), resolution: { width: 640, height: 480 }, orientation: "portrait-up" },
  ]);
  const preview = await device.startPreview();
  const first = await preview.nextFrame();
  expect(first.data[0]).toBe(1);
  expect(first.resolution).toEqual({ width: 640, height: 480 });
  const second = await preview.nextFrame();
  expect(second.data[0]).toBe(2);
  await expect(preview.nextFrame()).rejects.toMatchObject({ code: "ERR_CAMERA_NOT_AVAILABLE" });
  await preview.close();
});

test("preview closes once, and frames after close report already resolved", async () => {
  const { device } = await openDevice();
  const preview = await device.startPreview();
  await preview.close();
  await expect(preview.close()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
  await expect(preview.nextFrame()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
});

test("device closes once, and every later call reports already resolved", async () => {
  const { backend, device } = await openDevice();
  await device.close();
  expect(backend.closes()).toBe(1);
  await expect(device.close()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
  await expect(device.capturePhoto()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
  await expect(device.startRecording()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
  await expect(device.startPreview()).rejects.toMatchObject({ code: "ERR_CAMERA_ALREADY_RESOLVED" });
  expect(backend.closes()).toBe(1);
  expect(backend.recordings()).toBe(0);
});
