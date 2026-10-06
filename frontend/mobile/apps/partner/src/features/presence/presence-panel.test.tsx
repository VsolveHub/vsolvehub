import { AppState } from "react-native";

import { HEARTBEAT_INTERVAL_MS } from "./model/presence";

describe("presence heartbeat while the app is backgrounded", () => {
  it("only beats while AppState is active, and beats again as soon as it returns", () => {
    const beats: string[] = [];
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = () => {
      if (AppState.currentState !== "active") return;
      beats.push("beat");
    };
    const start = () => {
      beat();
      timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };

    Object.defineProperty(AppState, "currentState", { configurable: true, get: () => "background" });
    start();
    expect(beats).toEqual([]);
    stop();

    Object.defineProperty(AppState, "currentState", { configurable: true, get: () => "active" });
    start();
    expect(beats).toEqual(["beat"]);
    stop();
  });
});
