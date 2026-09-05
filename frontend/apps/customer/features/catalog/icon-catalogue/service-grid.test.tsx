import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ServiceIndexItem } from "../queries";
import type { CategoryGroup } from "./grouping";
import { ServiceGrid } from "./service-grid";

function service(overrides: Partial<ServiceIndexItem> = {}): ServiceIndexItem {
  return {
    id: "svc-1",
    slug: "fan-repair",
    name: "Fan Repair",
    icon_key: "electrical",
    display_order: 1,
    category_id: "cat-home",
    category_slug: "home",
    category_name: "Home",
    category_display_order: 1,
    subcategory_id: "sub-electrician",
    subcategory_slug: "electrician",
    subcategory_name: "Electrician",
    subcategory_display_order: 1,
    ...overrides,
  };
}

function category(
  name: string,
  displayOrder: number,
  services: ServiceIndexItem[],
): CategoryGroup {
  const first = services[0]!;
  return {
    id: first.category_id,
    slug: first.category_slug,
    name,
    displayOrder,
    serviceCount: services.length,
    subcategories: [
      {
        id: first.subcategory_id,
        slug: first.subcategory_slug,
        name: first.subcategory_name,
        displayOrder: first.subcategory_display_order,
        services,
      },
    ],
    services,
  };
}

const HOME = category("Home", 1, [
  service(),
  service({ id: "svc-2", slug: "switch-board-repair", name: "Switch Board Repair" }),
]);

const BEAUTY = category("Beauty", 2, [
  service({
    id: "svc-3",
    slug: "hair-cut",
    name: "Hair Cut",
    icon_key: "hair-care",
    category_id: "cat-beauty",
    category_slug: "beauty",
    category_name: "Beauty",
    category_display_order: 2,
    subcategory_id: "sub-hair",
    subcategory_slug: "hair-services",
    subcategory_name: "Hair Services",
  }),
]);

describe("the whole catalogue on one page", () => {
  it("renders every service as a link a customer can open", () => {
    render(<ServiceGrid categories={[HOME, BEAUTY]} />);

    expect(screen.getByRole("link", { name: "Fan Repair" })).toHaveAttribute(
      "href",
      "/catalog/home/fan-repair",
    );
    expect(screen.getByRole("link", { name: "Switch Board Repair" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hair Cut" })).toHaveAttribute(
      "href",
      "/catalog/beauty/hair-cut",
    );
  });

  it("keeps the backend's category order rather than sorting by name", () => {
    // "Beauty" sorts before "Home" alphabetically. Operations decided otherwise,
    // and the grid renders what it was handed.
    render(<ServiceGrid categories={[HOME, BEAUTY]} />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Home", "Beauty"]);
  });

  it("counts services per category so a reader can see how deep a trade goes", () => {
    render(<ServiceGrid categories={[HOME, BEAUTY]} />);

    const home = screen.getByRole("region", { name: "Home" });
    expect(within(home).getByText("2 services")).toBeInTheDocument();

    const beauty = screen.getByRole("region", { name: "Beauty" });
    // Not "1 services".
    expect(within(beauty).getByText("1 service")).toBeInTheDocument();
  });

  it("prints no subcategory headings — the section is the trade, the grid is flat", () => {
    render(<ServiceGrid categories={[HOME, BEAUTY]} />);

    // "Electrician" and "Hair Services" exist only as data on the rows; the
    // artboard's catalogue has exactly one heading level per section.
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });
});

describe("where a tile goes", () => {
  it("sends a tile wherever the href map says — the brief for a quote-based service", () => {
    const hrefs = new Map([
      // What service-links.ts computes for a guided (quote-based) archetype.
      ["fan-repair", "/requests/new/fan-repair"],
    ]);

    render(<ServiceGrid categories={[HOME]} hrefs={hrefs} />);

    expect(screen.getByRole("link", { name: "Fan Repair" })).toHaveAttribute(
      "href",
      "/requests/new/fan-repair",
    );
  });

  it("falls back to the service's own page for a slug the map does not know", () => {
    render(<ServiceGrid categories={[HOME]} hrefs={new Map()} />);

    expect(screen.getByRole("link", { name: "Fan Repair" })).toHaveAttribute(
      "href",
      "/catalog/home/fan-repair",
    );
  });
});

describe("the promise this grid exists to keep", () => {
  /**
   * FE-9's whole point: a catalogue at four hundred services must not be four
   * hundred image requests. That is easy to state and easy to regress — one
   * `<img>` added back to a tile for "visual interest" undoes it silently.
   *
   * So the requirement is mechanical here rather than aspirational: nothing in
   * the rendered output may fetch an image, by any of the three routes it could.
   */
  it("requests no images at all — no img, no background, no picture", () => {
    const { container } = render(<ServiceGrid categories={[HOME, BEAUTY]} />);

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("picture, source")).toHaveLength(0);

    for (const element of container.querySelectorAll<HTMLElement>("*")) {
      // Inline background-image, and the arbitrary-value Tailwind form the old
      // service card used. Deliberately not written out as a class here:
      // Tailwind scans source text, comments included, so spelling it in full
      // compiles a real rule with an unresolvable url and breaks the build.
      // That is not hypothetical — this comment did exactly that once.
      expect(element.style?.backgroundImage ?? "").toBe("");
      // `getAttribute`, not `className`: the grid renders inline SVG icons,
      // and on an SVGElement `className` is an SVGAnimatedString, not a string.
      expect(element.getAttribute("class") ?? "").not.toMatch(/url\(/);
    }
  });

  it("says so honestly when there is nothing published", () => {
    render(<ServiceGrid categories={[]} />);

    expect(screen.getByText(/No services published yet/i)).toBeInTheDocument();
    // The failure this guards against is a grid of plausible-looking sample
    // tiles standing in for an empty catalogue.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
