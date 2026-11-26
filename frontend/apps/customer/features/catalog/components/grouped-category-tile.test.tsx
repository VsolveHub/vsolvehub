import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GroupedCategoryTile } from "./grouped-category-tile";

const TRADES = [
  {
    id: "1",
    slug: "technician",
    name: "Technician",
    description: "Reviewed one-person task visits for everyday home needs.",
    image_url: "https://example.com/technician.png",
  },
  {
    id: "2",
    slug: "electrician",
    name: "Electrician",
    description: "Wiring, fittings, fans and power faults, fixed in one visit.",
    image_url: "https://example.com/electrician.jpg",
  },
  {
    id: "3",
    slug: "plumber",
    name: "Plumber",
    description: "Taps, leaks, drains and fittings, fixed in one visit.",
    image_url: "https://example.com/plumber.jpg",
  },
];

describe("GroupedCategoryTile", () => {
  it("renders a single Technician, Electrician & Plumber tile without sub-labels and opens a clean popup", () => {
    render(<GroupedCategoryTile members={TRADES} variant="desktop" />);

    const trigger = screen.getByRole("button", { name: "Technician, Electrician & Plumber" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByText(/Repairs & Maintenance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Technician · Electrician · Plumber/i)).not.toBeInTheDocument();

    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Technician, Electrician & Plumber" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Choose the specialist you need.")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Technician/i })).toHaveAttribute(
      "href",
      "/catalog/technician",
    );
    expect(screen.getByRole("link", { name: /Electrician/i })).toHaveAttribute(
      "href",
      "/catalog/electrician",
    );
    expect(screen.getByRole("link", { name: /Plumber/i })).toHaveAttribute(
      "href",
      "/catalog/plumber",
    );
    expect(
      screen.getByText("Wiring, fittings, fans and power faults, fixed in one visit."),
    ).toBeInTheDocument();

    const imgs = dialog.querySelectorAll("img");
    expect(imgs).toHaveLength(3);
    expect(Array.from(imgs).map((img) => img.getAttribute("src"))).toEqual([
      expect.stringContaining("technician.png"),
      expect.stringContaining("electrician.jpg"),
      expect.stringContaining("plumber.jpg"),
    ]);

    const technicianLink = screen.getByRole("link", { name: /Technician/i });
    const electricianLink = screen.getByRole("link", { name: /Electrician/i });
    const plumberLink = screen.getByRole("link", { name: /Plumber/i });
    expect(technicianLink.className).toContain("bg-white");
    expect(electricianLink.className).toContain("bg-white");
    expect(plumberLink.className).toContain("bg-white");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders unique heading IDs when desktop and mobile tiles mount together", () => {
    render(
      <>
        <GroupedCategoryTile members={TRADES} variant="desktop" />
        <GroupedCategoryTile members={TRADES} variant="mobile" />
      </>,
    );

    const dialogs = document.querySelectorAll("dialog");
    expect(dialogs).toHaveLength(2);
    const labelledIds = Array.from(dialogs).map((d) => d.getAttribute("aria-labelledby"));
    expect(new Set(labelledIds).size).toBe(2);
  });
});
