import { describe, expect, it, vi } from "vitest";
import { assignFirstAvailable } from "./assign";

const ranked = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("assignFirstAvailable", () => {
  it("assigns the first candidate that succeeds", async () => {
    const attempt = vi.fn(async () => ({ ok: true as const, startOtp: "111111" }));
    const r = await assignFirstAvailable(ranked, attempt);
    expect(r).toEqual({ ok: true, partnerId: "a", startOtp: "111111" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("skips a candidate that lost the slot and assigns the next", async () => {
    const attempt = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "SLOT_TAKEN" })
      .mockResolvedValueOnce({ ok: true, startOtp: "222222" });
    const r = await assignFirstAvailable(ranked, attempt);
    expect(r).toEqual({ ok: true, partnerId: "b", startOtp: "222222" });
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("returns ok:false when every candidate collides", async () => {
    const attempt = vi.fn(async () => ({ ok: false as const, error: "SLOT_TAKEN" }));
    const r = await assignFirstAvailable(ranked, attempt);
    expect(r).toEqual({ ok: false });
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("stops on a non-slot engine failure without trying more candidates", async () => {
    const attempt = vi.fn(async () => ({ ok: false as const, error: "Already assigned" }));
    const r = await assignFirstAvailable(ranked, attempt);
    expect(r).toEqual({ ok: false });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("returns ok:false for an empty candidate list", async () => {
    const attempt = vi.fn();
    const r = await assignFirstAvailable([], attempt);
    expect(r).toEqual({ ok: false });
    expect(attempt).not.toHaveBeenCalled();
  });
});
