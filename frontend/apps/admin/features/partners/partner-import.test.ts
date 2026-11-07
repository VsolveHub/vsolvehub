import { describe, expect, it } from "vitest";

import { IMPORT_COLUMNS, importProblems, importTemplateCsv } from "./partner-import";

describe("partner import file", () => {
  it("builds a template whose header is exactly the documented columns", () => {
    const [header, ...examples] = importTemplateCsv({ serviceArea: "hyderabad-core", skills: ["ac-technician", "body-care"] }).trim().split("\n");

    expect(header).toBe("phone,full_name,track,service_area,skills,experience_years");
    expect(header?.split(",")).toEqual(IMPORT_COLUMNS.map((column) => column.name));
    // Every example row has one value per column, empty or not.
    for (const row of examples) expect(row.split(",")).toHaveLength(IMPORT_COLUMNS.length);
    expect(examples[0]).toBe("9876543210,Ravi Kumar,SERVICES,hyderabad-core,ac-technician|body-care,4");
  });

  it("turns each failing cell into its own problem line and ignores clean rows", () => {
    const problems = importProblems([
      { row: 2, status: "ready", phone: "+919876543210", full_name: "Ravi", track: "SERVICES", problems: [] },
      { row: 3, status: "skipped", phone: "+919812345678", full_name: "Asha", track: "STAY_HOST", problems: [] },
      {
        row: 4,
        status: "error",
        phone: "98123",
        full_name: "",
        track: "SERVICES",
        problems: [
          { column: "phone", message: "Enter a 10-digit Indian mobile number." },
          { column: "full_name", message: "Name is required." },
        ],
      },
    ]);

    expect(problems).toEqual([
      { key: "4-0", row: 4, column: "phone", message: "Enter a 10-digit Indian mobile number." },
      { key: "4-1", row: 4, column: "full_name", message: "Name is required." },
    ]);
  });
});
