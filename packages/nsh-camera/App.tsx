import { mount, signal, Text, View } from "nsh";
import { asCameraError, Camera, memoryBackend } from "./src";

// No native camera is wired this release, so the demo runs on a scripted memory backend.
const backend = memoryBackend({ devices: [{ id: "demo", name: "Demo camera", position: "back" }] });
const camera = new Camera({ backend });
const unwired = new Camera();

const wiring = signal("checking");
const message = signal("nothing yet");

unwired.permission().then(
  (state) => wiring.set(`unwired default: ${state}`),
  (error: unknown) => wiring.set(`unwired default: ${asCameraError(error).code}`),
);

async function runDemo(): Promise<void> {
  const state = await camera.requestPermission();
  const devices = await camera.devices();
  const device = await camera.open("demo");
  const photo = await device.capturePhoto();
  message.set(
    `${state}; ${devices.length} device; photo ${photo.resolution.width}x${photo.resolution.height} ${photo.mime}`,
  );
  await device.close();
}

function App() {
  const run = () => {
    runDemo().catch((error: unknown) => message.set(asCameraError(error).code));
  };
  return (
    <View class="flex-1 gap-3 p-4">
      <Text testID="title" class="text-foreground">nsh-camera</Text>
      <Text testID="wiring" class="text-foreground">{wiring()}</Text>
      <Text testID="message" class="text-foreground">{message()}</Text>
      <Text testID="run" role="button" onPress={run} class="rounded-(--radius) bg-muted px-3 py-2">
        Run demo
      </Text>
    </View>
  );
}

mount(App);
