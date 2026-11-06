// Ported from frontend/apps/partner/features/application/model/main-categories.test.ts
import { findSkillForCategory, tickableCategories } from "./main-categories";

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
