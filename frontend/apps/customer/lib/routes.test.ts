import { describe, expect, it } from "vitest";

import {
  CAREER_JOBS_CATEGORY_SLUG,
  canonicalDetailPath,
  catalogCategoryHref,
  listingHref,
  rentalHref,
  stayHref,
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

describe("readable page addresses", () => {
  it("links public pages by slug", () => {
    expect(stayHref("sunrise-pg-madhapur")).toBe("/stays/sunrise-pg-madhapur");
    expect(rentalHref("demo-drill")).toBe("/rentals/demo-drill");
    expect(listingHref("electrician-needed-hyderabad")).toBe("/listings/electrician-needed-hyderabad");
  });

  it("moves an old id address to the slug once the page knows it", () => {
    const id = "0b5e7f5e-8f0a-4d7e-9b61-5f0a2d3c4b5a";
    expect(canonicalDetailPath("/stays", id, "sunrise-pg-madhapur")).toBe(
      "/stays/sunrise-pg-madhapur",
    );
    expect(canonicalDetailPath("/stays", "sunrise-pg-madhapur", "sunrise-pg-madhapur")).toBeNull();
    expect(canonicalDetailPath("/stays", id, undefined)).toBeNull();
  });
});
