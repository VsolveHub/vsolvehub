// Ported from frontend/apps/customer/features/catalog/components/promo-banners.test.tsx
import { render } from "@testing-library/react-native";

import type { PromoBanner } from "../client-queries";
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
  it("renders the backend's wording", async () => {
    const view = await render(<PromoBanners banners={[banner()]} fallbackImageUrl="" />);

    expect(view.getByText("Save 10% on electrical work")).toBeTruthy();
    expect(view.getByText("Book more than one service in the same visit")).toBeTruthy();
    expect(view.getByText("Valid on bookings above ₹300")).toBeTruthy();
  });

  it("uses the category artwork when the banner has no image", async () => {
    const view = await render(
      <PromoBanners banners={[banner()]} fallbackImageUrl="https://cdn.test/electrician.png" />,
    );
    expect(view.getByText("Save 10% on electrical work")).toBeTruthy();
  });

  it("prefers the banner's own image", async () => {
    const view = await render(
      <PromoBanners
        banners={[banner({ image_url: "https://cdn.test/offer.png" })]}
        fallbackImageUrl="https://cdn.test/electrician.png"
      />,
    );
    expect(view.getByText("Save 10% on electrical work")).toBeTruthy();
  });

  it("renders nothing when there are no live banners", async () => {
    const view = await render(<PromoBanners banners={[]} fallbackImageUrl="" />);
    expect(view.toJSON()).toBeNull();
  });
});
