import { decodePolyline } from "./polyline";

describe("decodePolyline", () => {
  it("decodes Google's documented example", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });

  it("returns no points for an empty line", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});
