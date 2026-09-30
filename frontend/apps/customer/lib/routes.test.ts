import { describe, expect, it } from "vitest";

import {
  CAREER_JOBS_CATEGORY_SLUG,
  catalogCategoryHref,
  isCareerJobsCategory,
  LISTINGS_HREF,
  listingsBrowseHref,
} from "./routes";

describe("catalogCategoryHref / listingsBrowseHref", () => {
  it("sends Career/Jobs taxonomy to the listing surface", () => {
    expect(isCareerJobsCategory(CAREER_JOBS_CATEGORY_SLUG)).toBe(true);
    expect(catalogCategoryHref(CAREER_JOBS_CATEGORY_SLUG)).toBe(LISTINGS_HREF);
    expect(catalogCategoryHref(CAREER_JOBS_CATEGORY_SLUG, "it-software-jobs")).toBe(
      `${LISTINGS_HREF}?service=it-software-jobs`,
    );
  });

  it("keeps bookable categories on the catalogue", () => {
    expect(catalogCategoryHref("home-services")).toBe("/catalog/home-services");
    expect(catalogCategoryHref("home-services", "electrical")).toBe(
      "/catalog/home-services?tile=electrical",
    );
  });

  it("builds listing browse URLs with an optional service hint", () => {
    expect(listingsBrowseHref()).toBe("/listings");
    expect(listingsBrowseHref("full-stack-developer")).toBe(
      "/listings?service=full-stack-developer",
    );
  });
});
