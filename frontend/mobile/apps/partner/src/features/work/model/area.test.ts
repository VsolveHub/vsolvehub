import { circleEdges, describeAreaDistance, distanceKm, nearestBelievable } from "./area";

const HYDERABAD = { latitude: 17.415, longitude: 78.341 };
const GACHIBOWLI = { latitude: 17.44, longitude: 78.35 };
const MANHATTAN = { latitude: 40.708, longitude: -74.009 };

describe("distanceKm", () => {
  it("measures a short hop and a long one", () => {
    expect(distanceKm(HYDERABAD, GACHIBOWLI)).toBeGreaterThan(2);
    expect(distanceKm(HYDERABAD, GACHIBOWLI)).toBeLessThan(4);
    expect(distanceKm(HYDERABAD, MANHATTAN)).toBeGreaterThan(12_000);
  });
});

describe("nearestBelievable", () => {
  it("refuses a same-named place in another city", () => {
    expect(nearestBelievable([MANHATTAN], GACHIBOWLI)).toBeNull();
  });

  it("takes the candidate near the Partner, whatever the order", () => {
    expect(nearestBelievable([MANHATTAN, HYDERABAD], GACHIBOWLI)).toEqual(HYDERABAD);
  });

  it("has nothing to offer when the lookup found nothing", () => {
    expect(nearestBelievable([], GACHIBOWLI)).toBeNull();
  });
});

describe("circleEdges", () => {
  it("surrounds the centre on all four sides", () => {
    const [north, south, east, west] = circleEdges(HYDERABAD);
    expect(north!.latitude).toBeGreaterThan(HYDERABAD.latitude);
    expect(south!.latitude).toBeLessThan(HYDERABAD.latitude);
    expect(east!.longitude).toBeGreaterThan(HYDERABAD.longitude);
    expect(west!.longitude).toBeLessThan(HYDERABAD.longitude);
  });
});

describe("describeAreaDistance", () => {
  it("words it as the estimate it is", () => {
    expect(describeAreaDistance(0.4)).toBe("Under 1 km away");
    expect(describeAreaDistance(3.4)).toBe("About 3 km away");
  });
});
