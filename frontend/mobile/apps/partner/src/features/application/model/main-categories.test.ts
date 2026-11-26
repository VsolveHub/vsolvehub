// Ported from frontend/apps/partner/features/application/model/main-categories.test.ts
import { findSkillForCategory, tickableCategories } from "./main-categories";

import {
  groupByService,
  isServiceGroupSelected,
  syncRequiredSkills,
  toggleServiceGroup,
} from "./main-categories";

const category = (slug: string, name: string) => ({ slug, name });
const skill = (code: string) => ({ code, name: code }) as never;

describe("trade categories on Your work", () => {
  const skills = [skill("electrician"), skill("event-staff"), skill("stay-host")];

  it("ticks Events through the event staff skill", () => {
    expect(findSkillForCategory(skills, category("events", "Events"))?.code).toBe("event-staff");
  });

  it("leaves out a category with no skill behind it, so no checkbox does nothing", () => {
    const shown = tickableCategories(
      [category("electrician", "Electrician"), category("rooms-pg-hostel-hotels", "Rooms / PG / Hostel / Hotels")],
      skills,
    );
    expect(shown.map((entry) => entry.slug)).toEqual(["electrician"]);
  });
});

const variant = (
  serviceId: string,
  serviceName: string,
  variantId: string,
  requiredSkillCode = "",
  categoryName = "Technician",
) => ({ serviceId, serviceName, categoryName, variantId, requiredSkillCode });

describe("services on Your work", () => {
  const catalogue = [
    variant("stove", "Gas Stove Repair", "v-2", "gas-technician"),
    variant("stove", "Gas Stove Repair", "v-3", "gas-technician"),
    variant("stove", "Gas Stove Repair", "v-4", "gas-technician"),
    variant("door", "Door Repair", "v-door"),
  ];

  it("shows one entry per service, however many variants it has", () => {
    const groups = groupByService(catalogue);
    expect(groups.map((group) => group.serviceName)).toEqual(["Gas Stove Repair", "Door Repair"]);
    expect(groups[0]?.variantIds).toEqual(["v-2", "v-3", "v-4"]);
    expect(groups[0]?.requiredSkillCodes).toEqual(["gas-technician"]);
    expect(groups[1]?.requiredSkillCodes).toEqual([]);
  });

  it("keeps two services with the same name in different categories apart", () => {
    const groups = groupByService([
      variant("a", "Cleaning", "v1", "", "Home services"),
      variant("b", "Cleaning", "v2", "", "Beautician"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("ticking a service takes every variant, unticking drops them all", () => {
    const [stove] = groupByService(catalogue);
    const ticked = toggleServiceGroup(stove!, ["v-door"]);
    expect(ticked.sort()).toEqual(["v-2", "v-3", "v-4", "v-door"]);
    expect(toggleServiceGroup(stove!, ticked)).toEqual(["v-door"]);
  });

  it("reads an application saved with only one variant as doing the service", () => {
    const [stove] = groupByService(catalogue);
    expect(isServiceGroupSelected(stove!, ["v-3"])).toBe(true);
    expect(isServiceGroupSelected(stove!, ["v-door"])).toBe(false);
  });
});

describe("required trades follow the services", () => {
  const skills = [skill("carpenter"), skill("gas-technician")];
  const services = [
    { variantId: "v-2", requiredSkillCode: "gas-technician" },
    { variantId: "v-3", requiredSkillCode: "gas-technician" },
    { variantId: "v-door", requiredSkillCode: "" },
    { variantId: "v-x", requiredSkillCode: "not-offered" },
  ];
  const base = { services, skills, categorySkillCodes: ["carpenter"] };

  it("adds the trade a ticked service needs", () => {
    expect(
      syncRequiredSkills({ ...base, skillCodes: ["carpenter"], previousVariantIds: [], nextVariantIds: ["v-2", "v-3"] }).sort(),
    ).toEqual(["carpenter", "gas-technician"]);
  });

  it("removes it once the last service needing it is gone, but never a category's own trade", () => {
    expect(
      syncRequiredSkills({
        ...base,
        skillCodes: ["carpenter", "gas-technician"],
        previousVariantIds: ["v-2", "v-3"],
        nextVariantIds: [],
      }),
    ).toEqual(["carpenter"]);
  });

  it("keeps it while another ticked service still needs it", () => {
    expect(
      syncRequiredSkills({
        ...base,
        skillCodes: ["gas-technician"],
        previousVariantIds: ["v-2", "v-3"],
        nextVariantIds: ["v-3"],
      }),
    ).toEqual(["gas-technician"]);
  });

  it("never adds a trade Django does not offer", () => {
    expect(
      syncRequiredSkills({ ...base, skillCodes: [], previousVariantIds: [], nextVariantIds: ["v-x"] }),
    ).toEqual([]);
  });
});
