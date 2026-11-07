// Ported from frontend/apps/partner/features/catalog/queries.test.ts
jest.mock("@vsolve/mobile-core", () => ({ getApiClient: () => ({}) }));

import { visibleMainCategories } from "./queries";

const row = (slug: string) => ({ id: slug, slug, name: slug, icon_key: "", image_url: "" });

describe("main categories offered as trades", () => {
  it("hides stays (both slugs), rentals and crew & projects, which are not trades", () => {
    const shown = visibleMainCategories(
      ["electrician", "rooms-pg-hostel", "rooms-pg-hostel-hotels", "rental-services", "workforce-and-projects"].map(row),
    );
    expect(shown.map((entry) => entry.slug)).toEqual(["electrician"]);
  });

  it("shows every trade, not only the first nine", () => {
    const slugs = Array.from({ length: 12 }, (_, index) => `trade-${index}`);
    expect(visibleMainCategories(slugs.map(row))).toHaveLength(12);
  });
});
