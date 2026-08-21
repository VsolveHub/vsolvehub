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

  /*
    The regression this component needed and never had.

    `cn` is `clsx`, not `tailwind-merge`, so while the size was hard-coded as
    `h-6 w-6` *and* callers passed their own `h-N w-N`, both survived into the
    class list and the cascade — not the caller — decided which won. Tailwind
    emits height utilities in ascending scale order, so the larger always won:
    an icon asked to be 12px drew at 24px, and no type check could see it.

    Asserting "exactly one height utility" is what makes that impossible to
    reintroduce. A second `h-` in the list is the bug, whatever its value.
  */
  const SIZE_CLASS = {
    xs: "h-3",
    sm: "h-4",
    md: "h-6",
    lg: "h-8",
    xl: "h-10",
  } as const;

  it.each(Object.entries(SIZE_CLASS))(
    "size=%s emits exactly one height utility, and it is the right one",
    (size, expected) => {
      const { container } = render(
        <Pictogram name="call" size={size as keyof typeof SIZE_CLASS} />,
      );
      const classes = container.querySelector("svg")?.getAttribute("class")?.split(/\s+/) ?? [];

      expect(classes.filter((entry) => /^h-/.test(entry))).toEqual([expected]);
      expect(classes.filter((entry) => /^w-/.test(entry))).toEqual([
        expected.replace("h-", "w-"),
      ]);
    },
  );

  it("defaults to md when no size is passed", () => {
    const { container } = render(<Pictogram name="call" />);
    const classes = container.querySelector("svg")?.getAttribute("class")?.split(/\s+/) ?? [];
    expect(classes.filter((entry) => /^h-/.test(entry))).toEqual(["h-6"]);
  });

  it("keeps a className alongside the size without adding a second height", () => {
    const { container } = render(
      <Pictogram name="call" size="lg" className="shrink-0 text-surface" />,
    );
    const classes = container.querySelector("svg")?.getAttribute("class")?.split(/\s+/) ?? [];

    expect(classes.filter((entry) => /^h-/.test(entry))).toEqual(["h-8"]);
    expect(classes).toContain("shrink-0");
    expect(classes).toContain("text-surface");
  });
});
