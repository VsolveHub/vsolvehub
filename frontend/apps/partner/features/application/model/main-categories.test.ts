import { describe, expect, it } from "vitest";

import {
  isStayOfferingSelected,
  isTradeCategorySelected,
  stayOfferingGroups,
  toggleStayOffering,
  toggleTradeCategorySelection,
} from "./main-categories";

const stayCategory = {
  id: "cat-stay",
  slug: "rooms-pg-hostel",
  name: "Rooms / PG / Hostel / Hotels",
  iconKey: "building",
  imageUrl: "",
};

const staySkill = { id: "skill-1", code: "property-host", name: "Property host" };

const pg = {
  categoryName: stayCategory.name,
  variantId: "pg-1",
  subcategorySlug: "pg-accommodation",
  subcategoryName: "PG Accommodation",
  requiredSkillCode: "property-host",
};

const hostel = {
  categoryName: stayCategory.name,
  variantId: "hostel-1",
  subcategorySlug: "hostels",
  subcategoryName: "Hostels",
  requiredSkillCode: "property-host",
};

describe("partner stay trade selection", () => {
  it("opens Rooms / PG / Hostel without selecting every listing type", () => {
    const next = toggleTradeCategorySelection(
      stayCategory,
      [staySkill],
      [pg, hostel],
      [],
      [],
    );

    expect(next.skillCodes).toEqual(["property-host"]);
    expect(next.serviceVariantIds).toEqual([]);
    expect(
      isTradeCategorySelected(
        stayCategory,
        [staySkill],
        next.skillCodes,
        [pg, hostel],
        next.serviceVariantIds,
      ),
    ).toBe(true);
  });

  it("groups listing SKUs into stay types a host can pick", () => {
    const groups = stayOfferingGroups(stayCategory.name, [
      pg,
      { ...pg, variantId: "pg-2" },
      hostel,
    ]);

    expect(groups.map((group) => group.name)).toEqual(["PG Accommodation", "Hostels"]);
    const pgGroup = groups[0];
    const selected = toggleStayOffering(pgGroup, [], ["property-host"]);
    expect(selected.serviceVariantIds).toEqual(["pg-1", "pg-2"]);
    expect(isStayOfferingSelected(pgGroup, selected.serviceVariantIds)).toBe(true);
  });
});
