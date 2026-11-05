import { decodePolyline, describeRoute, isRoutable, type VisitRoute } from "./route";
import type { PartnerVisit } from "./queries";

describe("the route line", () => {
  it("decodes Google's encoded polyline", () => {
    // The worked example from Google's polyline algorithm documentation.
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });

  it("puts nothing on the map for an empty line", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});

describe("the time and distance chip", () => {
  const route = (distance_meters: number, duration_seconds: number) =>
    ({ distance_meters, duration_seconds }) as Pick<VisitRoute, "distance_meters" | "duration_seconds">;

  it("reads like the rider apps", () => {
    expect(describeRoute(route(2800, 420))).toBe("7 min · 2.8 km");
    expect(describeRoute(route(650, 90))).toBe("2 min · 650 m");
    expect(describeRoute(route(42_000, 4_500))).toBe("1 hr 15 min · 42 km");
  });

  it("never says zero minutes to a Partner who is nearly there", () => {
    expect(describeRoute(route(0, 0))).toBe("1 min · 0 m");
  });
});

describe("when there is a route to draw", () => {
  const visit = (status: string, address: unknown) => ({ status, site_address: address }) as unknown as PartnerVisit;

  it("needs the address to be the Partner's to see", () => {
    expect(isRoutable(visit("EN_ROUTE", null))).toBe(false);
    expect(isRoutable(visit("EN_ROUTE", { line1: "12 MG Road" }))).toBe(true);
  });

  it("stops once the visit no longer needs driving to", () => {
    expect(isRoutable(visit("IN_PROGRESS", { line1: "12 MG Road" }))).toBe(false);
    expect(isRoutable(visit("COMPLETED", { line1: "12 MG Road" }))).toBe(false);
  });
});
