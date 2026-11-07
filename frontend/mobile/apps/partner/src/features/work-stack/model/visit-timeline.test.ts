import { formatStartsIn, visitTimeline } from "./visit-timeline";

const gates = { address_unlocks_at: "2026-11-06T01:30:00Z", en_route_opens_at: "2026-11-06T02:30:00Z" };
const visit = (site_address: unknown, en_route_at: string | null) => ({
  site_address,
  en_route_at,
  scheduled_start: "2026-11-06T03:30:00Z",
  gates,
});
const states = (input: ReturnType<typeof visit>) => visitTimeline(input).map((step) => step.state);

describe("visitTimeline", () => {
  it("waits on the address first", () => {
    expect(states(visit(null, null))).toEqual(["current", "next", "next"]);
  });

  it("moves to travelling once the server has sent the address", () => {
    expect(states(visit({ line1: "Maple pg" }, null))).toEqual(["done", "current", "next"]);
  });

  it("moves to the job once the Partner has set off", () => {
    expect(states(visit({ line1: "Maple pg" }, "2026-11-06T02:40:00Z"))).toEqual(["done", "done", "current"]);
  });

  it("uses the server's times, in order", () => {
    expect(visitTimeline(visit(null, null)).map((step) => step.at)).toEqual([
      gates.address_unlocks_at,
      gates.en_route_opens_at,
      "2026-11-06T03:30:00Z",
    ]);
  });
});

describe("formatStartsIn", () => {
  const MINUTE = 60_000;

  it("reads at a glance at every scale", () => {
    expect(formatStartsIn(12 * MINUTE)).toBe("12 min");
    expect(formatStartsIn(860 * MINUTE)).toBe("14h 20m");
    expect(formatStartsIn(51 * 60 * MINUTE)).toBe("2d 3h");
  });

  it("never rounds a last few seconds down to zero", () => {
    expect(formatStartsIn(5_000)).toBe("1 min");
  });

  it("has nothing to say once the time has passed", () => {
    expect(formatStartsIn(0)).toBeNull();
    expect(formatStartsIn(-MINUTE)).toBeNull();
  });
});
