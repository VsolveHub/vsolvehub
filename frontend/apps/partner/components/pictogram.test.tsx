import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Pictogram, type PictogramName } from "./pictogram";

const ALL_NAMES: readonly PictogramName[] = [
  "wiring", "water", "walls", "paint", "floor", "wood", "cooling", "machine",
  "clean", "welding", "fit-out", "warranty", "all-work", "site", "home", "more",
  "yes", "no", "call", "photo", "go", "back", "price", "power",
  "distance", "time", "date", "days", "money", "crew", "rating", "papers",
  "now", "doing", "done", "held", "later", "stopped", "new", "language",
];

describe("Pictogram", () => {
  it("renders every declared name without throwing", () => {
    for (const name of ALL_NAMES) {
      const { container, unmount } = render(<Pictogram name={name} />);
      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });

  it("is decorative: the svg is aria-hidden, never an accessible name of its own", () => {
    const { container } = render(<Pictogram name="call" />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden");
  });

  it("takes stroke colour from currentColor, so a parent's text colour recolours it", () => {
    const { container } = render(<Pictogram name="call" className="text-success-text" />);
    expect(container.querySelector("svg")).toHaveAttribute("stroke", "currentColor");
  });
});
