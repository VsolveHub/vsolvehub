import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PromoBanner } from "../queries";
import { PromoBanners } from "./promo-banners";

function banner(overrides: Partial<PromoBanner> = {}): PromoBanner {
  return {
    id: "b1",
    title: "Save 10% on electrical work",
    subtitle: "Book more than one service in the same visit",
    terms: "Valid on bookings above ₹300",
    image_url: "",
    category_slug: "electrician",
    ...overrides,
  } as PromoBanner;
}

describe("PromoBanners", () => {
  it("renders the backend's wording", () => {
    render(<PromoBanners banners={[banner()]} fallbackImageUrl="" />);

    expect(screen.getByRole("heading", { name: "Save 10% on electrical work" })).toBeInTheDocument();
    expect(screen.getByText("Book more than one service in the same visit")).toBeInTheDocument();
    expect(screen.getByText("Valid on bookings above ₹300")).toBeInTheDocument();
  });

  it("uses the category artwork when the banner has no image", () => {
    const { container } = render(
      <PromoBanners banners={[banner()]} fallbackImageUrl="https://cdn.test/electrician.png" />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.test/electrician.png",
    );
  });

  it("prefers the banner's own image", () => {
    const { container } = render(
      <PromoBanners
        banners={[banner({ image_url: "https://cdn.test/offer.png" })]}
        fallbackImageUrl="https://cdn.test/electrician.png"
      />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/offer.png");
  });

  it("renders nothing when there are no live banners", () => {
    const { container } = render(<PromoBanners banners={[]} fallbackImageUrl="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
