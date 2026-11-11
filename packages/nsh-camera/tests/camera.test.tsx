import { expect, test } from "nsh/test";
import { Camera, memoryBackend } from "../src";

test("a camera with no backend has no capture service to ask", async () => {
  const camera = new Camera();
  expect(await camera.permission()).toBe("not-determined");
  await expect(camera.requestPermission()).rejects.toMatchObject({ code: "ERR_CAMERA_NOT_AVAILABLE" });
  await expect(camera.devices()).rejects.toMatchObject({ code: "ERR_CAMERA_NOT_AVAILABLE" });
  await expect(camera.open("any")).rejects.toMatchObject({ code: "ERR_CAMERA_NOT_AVAILABLE" });
});

test("a granted script starts not-determined and resolves requestPermission as granted", async () => {
  const backend = memoryBackend();
  const camera = new Camera({ backend });
  expect(await camera.permission()).toBe("not-determined");
  backend.grantPermission();
  expect(await camera.requestPermission()).toBe("granted");
  expect(await camera.permission()).toBe("granted");
});

test("devices returns the scripted list", async () => {
  const backend = memoryBackend();
  const camera = new Camera({ backend });
  backend.withDevices([{ id: "front-1", name: "Front camera", position: "front" }]);
  expect(await camera.devices()).toEqual([{ id: "front-1", name: "Front camera", position: "front" }]);
});

test("opening an id the list does not hold reports no camera", async () => {
  const backend = memoryBackend();
  const camera = new Camera({ backend });
  backend.withDevices([{ id: "front-1", name: "Front camera", position: "front" }]);
  await expect(camera.open("back-9")).rejects.toMatchObject({ code: "ERR_CAMERA_NOT_AVAILABLE" });
});

test("opening an empty id is an invalid argument", async () => {
  const camera = new Camera({ backend: memoryBackend() });
  await expect(camera.open("")).rejects.toMatchObject({ code: "ERR_CAMERA_INVALID_ARGUMENT" });
});

test("an armed open failure skips unknown ids and still fires on the scripted one", async () => {
  const backend = memoryBackend();
  const camera = new Camera({ backend });
  backend.withDevices([{ id: "front-1", name: "Front camera", position: "front" }]);
  backend.failOpenWith("ERR_CAMERA_DEVICE_BUSY");
  await expect(camera.open("back-9")).rejects.toMatchObject({ code: "ERR_CAMERA_NOT_AVAILABLE" });
  await expect(camera.open("front-1")).rejects.toMatchObject({ code: "ERR_CAMERA_DEVICE_BUSY" });
});
