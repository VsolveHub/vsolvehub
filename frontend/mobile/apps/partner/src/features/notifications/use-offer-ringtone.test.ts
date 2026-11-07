import { act, renderHook } from "@testing-library/react-native";
import { Vibration } from "react-native";

import { shouldRing, useOfferRingtone } from "./use-offer-ringtone";

const mockPlayer = { loop: false, play: jest.fn(), pause: jest.fn(), remove: jest.fn() };

jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../../assets/sounds/booking_alert.wav", () => 1, { virtual: true });

describe("shouldRing", () => {
  it("rings only for a pending offer with server time left", () => {
    expect(shouldRing("PENDING", 30)).toBe(true);
    expect(shouldRing("PENDING", 0)).toBe(false);
    expect(shouldRing("ACCEPTED", 30)).toBe(false);
    expect(shouldRing("EXPIRED", 30)).toBe(false);
  });
});

describe("useOfferRingtone", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Vibration, "vibrate").mockImplementation(() => undefined);
    jest.spyOn(Vibration, "cancel").mockImplementation(() => undefined);
  });

  it("loops the alert while active and stops when it ends", async () => {
    const { rerender } = await renderHook(({ on }: { on: boolean }) => useOfferRingtone(on), { initialProps: { on: true } });
    await act(async () => {});
    expect(mockPlayer.loop).toBe(true);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(Vibration.vibrate).toHaveBeenCalledWith([0, 500, 400], true);

    await act(async () => rerender({ on: false }));
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(mockPlayer.remove).toHaveBeenCalled();
    expect(Vibration.cancel).toHaveBeenCalled();
  });

  it("does not ring when inactive", async () => {
    await renderHook(() => useOfferRingtone(false));
    await act(async () => {});
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it("silence stops the ring but is not a decline", async () => {
    const { result } = await renderHook(() => useOfferRingtone(true));
    await act(async () => {});
    await act(async () => result.current.silence());
    expect(result.current.silenced).toBe(true);
    expect(mockPlayer.pause).toHaveBeenCalled();
  });
});
