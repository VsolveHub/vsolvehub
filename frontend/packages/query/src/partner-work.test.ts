import { describe, expect, it } from "vitest";

import { groupByService, isListingTrack, workCatalogFrom } from "./partner-work";

describe("tracks", () => {
  it("gives stays, rentals and hiring the short application, and services the full one", () => {
    // Regression: an employer was treated as a services applicant and asked for trades, areas and hours.
    expect(isListingTrack("STAY_HOST")).toBe(true);
    expect(isListingTrack("RENTAL_OWNER")).toBe(true);
    expect(isListingTrack("EMPLOYER")).toBe(true);
    expect(isListingTrack("SERVICES")).toBe(false);
    expect(isListingTrack(null)).toBe(false);
  });
});

describe("the work catalogue", () => {
  const payload = [
    {
      id: "c1",
      slug: "technician",
      name: "Technician",
      icon_key: "wrench",
      image_url: "",
      services: [
        {
          id: "s1",
          slug: "gas-stove-repair",
          name: "Gas Stove Repair",
          variants: [
            { id: "v1", code: "2-burner", name: "2 burner", required_skill_code: "gas-stove-technician" },
            { id: "v2", code: "3-burner", name: "3 burner", required_skill_code: "gas-stove-technician" },
          ],
        },
      ],
    },
  ];

  it("becomes a row per variant that names its service, and groups back to one service", () => {
    const { services, mainCategories } = workCatalogFrom(payload);
    expect(mainCategories.map((category) => category.slug)).toEqual(["technician"]);
    expect(services).toHaveLength(2);
    const [group] = groupByService(services);
    expect(group).toMatchObject({ serviceName: "Gas Stove Repair", variantIds: ["v1", "v2"] });
  });
});
