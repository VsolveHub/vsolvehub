import { describe, expect, it } from "vitest";

import { applySkillSuggestion, skillSuggestions } from "./model";

const pool = ["JavaScript", "Python", "Databases", "Git", "Java", "python", "Customer support"];

describe("skill suggestions while typing", () => {
  it("offers skills starting with the unfinished entry before ones that merely contain it", () => {
    expect(skillSuggestions("Ja", pool)).toEqual(["JavaScript", "Java"]);
    expect(skillSuggestions("base", pool)).toEqual(["Databases"]);
  });

  it("only looks at the text after the last comma", () => {
    expect(skillSuggestions("Python, gi", pool)).toEqual(["Git"]);
  });

  it("never offers a skill already entered, ignoring case and duplicates in the pool", () => {
    expect(skillSuggestions("python, ", pool)).not.toContain("Python");
    expect(skillSuggestions("py", pool)).toEqual(["Python"]);
  });

  it("offers nothing for a skill typed in full", () => {
    expect(skillSuggestions("Git", ["Git"])).toEqual([]);
  });

  it("caps the list", () => {
    expect(skillSuggestions("", pool, 3)).toHaveLength(3);
  });
});

describe("picking a suggestion", () => {
  it("replaces the unfinished entry and leaves room for the next", () => {
    expect(applySkillSuggestion("Py", "Python")).toBe("Python, ");
    expect(applySkillSuggestion("Python,  gi", "Git")).toBe("Python, Git, ");
  });
});
