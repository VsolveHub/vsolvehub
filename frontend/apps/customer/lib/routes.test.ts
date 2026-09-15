import { describe, expect, it } from "vitest";

import {
  CAREER_JOBS_CATEGORY_SLUG,
  catalogCategoryHref,
  isCareerJobsCategory,
  LISTINGS_HREF,
  listingsBrowseHref,
  RENTAL_SERVICES_CATEGORY_SLUG,
  RENTALS_HREF,
  STAY_CATEGORY_SLUG,
  STAYS_HREF,
} from "./routes";

describe("catalogCategoryHref / listingsBrowseHref", () => {
  it("sends Career/Jobs taxonomy to the listing surface", () => {
    expect(isCareerJobsCategory(CAREER_JOBS_CATEGORY_SLUG)).toBe(true);
    expect(catalogCategoryHref(CAREER_JOBS_CATEGORY_SLUG)).toBe(LISTINGS_HREF);
    expect(catalogCategoryHref(CAREER_JOBS_CATEGORY_SLUG, "it-software-jobs")).toBe(
      LISTINGS_HREF,
    );
  });

  it("keeps bookable categories on the catalogue", () => {
    expect(catalogCategoryHref("home-services")).toBe("/catalog/home-services");
    expect(catalogCategoryHref("home-services", "electrical")).toBe(
      "/catalog/home-services?tile=electrical",
    );
  });

  it("sends Rental and Stay taxonomy to their own surfaces, never cart or requests", () => {
    expect(catalogCategoryHref(RENTAL_SERVICES_CATEGORY_SLUG)).toBe(RENTALS_HREF);
    expect(catalogCategoryHref(RENTAL_SERVICES_CATEGORY_SLUG, "power-tools")).toBe(RENTALS_HREF);
    expect(catalogCategoryHref(STAY_CATEGORY_SLUG)).toBe(STAYS_HREF);
    expect(catalogCategoryHref(STAY_CATEGORY_SLUG, "pg")).toBe(STAYS_HREF);
  });

  it("builds listing browse URLs with an optional service hint", () => {
    expect(listingsBrowseHref()).toBe("/listings");
    expect(listingsBrowseHref("full-stack-developer")).toBe(
      "/listings?service=full-stack-developer",
    );
  });

  it("URL-encodes the service hint so a slug cannot break the query", () => {
    expect(listingsBrowseHref("cnc operator")).toBe("/listings?service=cnc%20operator");
  });
});
