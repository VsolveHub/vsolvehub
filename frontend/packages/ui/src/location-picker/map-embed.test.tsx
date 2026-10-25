import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MapEmbed, mapEmbedUrl } from "./map-embed";

/**
 * The read-only map. The property that matters is the difference between the
 * two modes: `place` marks the point, `area` must not — a stay's building is
 * never pointed at, even from an already-rounded coordinate.
 */

describe("map embed", () => {
  it("marks a public place with a pin", () => {
    const url = new URL(
      mapEmbedUrl({ apiKey: "k", latitude: "17.494812", longitude: "78.399574", mode: "place" }),
    );

    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/embed/v1/place");
    expect(url.searchParams.get("q")).toBe("17.494812,78.399574");
  });

  it("shows an area without a marker", () => {
    const url = new URL(
      mapEmbedUrl({ apiKey: "k", latitude: "17.45", longitude: "78.39", mode: "area" }),
    );

    expect(url.pathname).toBe("/maps/embed/v1/view");
    expect(url.searchParams.get("center")).toBe("17.45,78.39");
    expect(url.searchParams.has("q")).toBe(false);
  });

  it("renders nothing without a key, so the text address stands alone", () => {
    const { container } = render(
      <MapEmbed apiKey="" latitude="17.45" longitude="78.39" mode="area" title="Map" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("names the iframe for screen readers and loads it lazily", () => {
    render(
      <MapEmbed
        apiKey="k"
        latitude="17.45"
        longitude="78.39"
        mode="area"
        title="Map of the area around Lakeview PG"
      />,
    );

    const frame = screen.getByTitle("Map of the area around Lakeview PG");
    expect(frame).toHaveAttribute("loading", "lazy");
  });
});
