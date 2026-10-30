import { describe, expect, it } from "vitest";

import type { ServiceDetail } from "./queries";
import {
  addsToServiceCopy,
  durationLabel,
  formatDuration,
  policyTexts,
  warrantyText,
} from "./service-facts";

type Policy = ServiceDetail["policies"][number];
type Variant = ServiceDetail["variants"][number];

function policy(kind: Policy["kind"], text: string, title = ""): Policy {
  return { id: `${kind}-${text}`, kind, title, text, display_order: 1 } as Policy;
}

function variant(minutes: number[]): Variant {
  return {
    task_lines: minutes.map((value, index) => ({
      code: `task-${index}`,
      label: `Task ${index}`,
      unit_price: { amount_paise: 49_900, currency: "INR" },
      marginal_duration_minutes: value,
    })),
  } as unknown as Variant;
}

describe("policyTexts", () => {
  it("returns only the requested kind, trimmed, without blanks", () => {
    const policies = [policy("INCLUDED", " Labour "), policy("EXCLUDED", "Parts"), policy("INCLUDED", " ")];
    expect(policyTexts(policies, "INCLUDED")).toEqual(["Labour"]);
  });

  it("is empty when the service publishes nothing", () => {
    expect(policyTexts(undefined, "INCLUDED")).toEqual([]);
  });
});

describe("warrantyText", () => {
  it("reads a published warranty line", () => {
    expect(warrantyText([policy("INCLUDED", "30-day warranty on the workmanship")])).toBe(
      "30-day warranty on the workmanship",
    );
  });

  it("does not treat an exclusion as a warranty", () => {
    expect(warrantyText([policy("EXCLUDED", "Manufacturer warranty claims")])).toBeNull();
  });

  it("invents nothing when no policy mentions one", () => {
    expect(warrantyText([policy("INCLUDED", "Labour")])).toBeNull();
  });
});

describe("durationLabel", () => {
  it("states one task line as an estimate", () => {
    expect(durationLabel(variant([110]))).toBe("About 1 hr 50 min");
  });

  it("states several task lines as a floor", () => {
    expect(durationLabel(variant([90, 45]))).toBe("From 45 min");
  });

  it("says nothing when the server published no duration", () => {
    expect(durationLabel(variant([]))).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [45, "45 min"],
    [60, "1 hr"],
    [125, "2 hr 5 min"],
  ])("%i minutes reads as %s", (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe("addsToServiceCopy", () => {
  it("drops a variant line that repeats the service sentence", () => {
    expect(addsToServiceCopy("AC Deep Cleaning carried out.", "ac deep cleaning  carried out.")).toBe(false);
  });

  it("keeps a line that says something new", () => {
    expect(addsToServiceCopy("For units up to 1 ton.", "AC Deep Cleaning carried out.")).toBe(true);
  });

  it("drops an empty line", () => {
    expect(addsToServiceCopy("  ", "Anything")).toBe(false);
  });
});
