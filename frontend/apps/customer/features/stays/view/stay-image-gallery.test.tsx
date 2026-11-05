import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StayImageGallery } from "./stay-image-gallery";

const photo = { id: "1", url: "https://media.example.com/a.jpg", caption: "Drill", display_order: 0 };

describe("StayImageGallery", () => {
  it("draws nothing without photos, never a stand-in", () => {
    const { container } = render(<StayImageGallery media={[]} title="Empty" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("crops by default, for rooms", () => {
    render(<StayImageGallery media={[photo as never]} title="Room" />);
    expect(screen.getByAltText("Drill").className).toContain("object-cover");
  });

  it("shows the whole photo when asked, for products", () => {
    render(<StayImageGallery media={[photo as never]} title="Drill" fit="contain" />);
    expect(screen.getByAltText("Drill").className).toContain("object-contain");
  });
});
