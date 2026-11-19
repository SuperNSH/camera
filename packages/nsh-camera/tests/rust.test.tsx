import { expect, test } from "nsh/test";
import { Camera } from "../src";
import { rustBackend } from "../src/rust";

// The crate wires no platform link yet, so every call crosses the bridge and comes back as
// the crate's own coded rejection, which proves the code survives the crossing.
test("the crate answers not available through the native bridge", async () => {
  const camera = new Camera({ backend: rustBackend() });
  await expect(camera.permission()).rejects.toMatchObject({ code: "ERR_CAMERA_NOT_AVAILABLE" });
  await expect(camera.requestPermission()).rejects.toMatchObject({ code: "ERR_CAMERA_NOT_AVAILABLE" });
  await expect(camera.devices()).rejects.toMatchObject({ code: "ERR_CAMERA_NOT_AVAILABLE" });
  await expect(camera.open("front")).rejects.toMatchObject({ code: "ERR_CAMERA_NOT_AVAILABLE" });
});

test("an empty id never reaches the crate", async () => {
  const camera = new Camera({ backend: rustBackend() });
  await expect(camera.open("")).rejects.toMatchObject({ code: "ERR_CAMERA_INVALID_ARGUMENT" });
});
