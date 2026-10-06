import * as Device from "expo-device";

/** Shown in the session list, for example `Pixel 7 · Android 14`. */
export function deviceLabel(): string {
  const model = Device.modelName ?? "Phone";
  const os = Device.osName ?? "OS";
  const version = Device.osVersion ?? "";
  return `${model} · ${os}${version ? ` ${version}` : ""}`;
}
