import { describe, expect, it } from "vitest";

import {
  isWizardActionPending,
  isWorkspaceAdvancingForScreen,
  persistVisitPlanSelectionForSubmit,
  prepareRequirementForSubmit,
  toPlaceAndDateSaveInput,
} from "./requirement-flow";
import { existingDraftId, type RequirementSummary } from "../queries";

function summary(overrides: Partial<RequirementSummary> = {}): RequirementSummary {
  return {
    id: "request-1",
    status: "DRAFT",
    category_slug: "helpers",
    service_name: "Helpers",
    lifecycle_explanation: "You are hiring people for a period of time.",
    service_by: null,
    quote_delivery_deadline_at: "2026-08-21T10:00:00Z",
    teaser_count: 0,
    closure_reason: null,
    last_activity_at: "2026-08-20T10:00:00Z",
    engagement_id: null,
    ...overrides,
  };
}

describe("existing draft resume", () => {
  it("reopens the editable draft for the chosen service", () => {
    expect(existingDraftId([summary()], "helpers")).toBe("request-1");
  });

  it("does not treat a live request or another service as an editable draft", () => {
    expect(
      existingDraftId(
        [summary({ status: "MATCHING" }), summary({ category_slug: "painters" })],
        "helpers",
      ),
    ).toBeNull();
  });
});

describe("requirement flow saving state", () => {
  it("does not keep Where and when loading for the hidden service-selection create", () => {
    expect(
      isWorkspaceAdvancingForScreen({
        screen: "where_when",
        isCreatingRequirement: true,
        isSavingRequirement: false,
      }),
    ).toBe(false);
  });

  it("still shows loading while the current screen is being saved", () => {
    expect(
      isWorkspaceAdvancingForScreen({
        screen: "where_when",
        isCreatingRequirement: false,
        isSavingRequirement: true,
      }),
    ).toBe(true);
  });

  it("does not busy the send CTA for a background draft restore", () => {
    expect(
      isWizardActionPending({
        screen: "visits_send",
        isAdvancingCurrentScreen: false,
        isPreparingSubmit: false,
        isSubmittingRequirement: false,
        isChoosingPlan: false,
      }),
    ).toBe(false);
  });

  it("keeps the send CTA busy for the writes started by that button", () => {
    expect(
      isWizardActionPending({
        screen: "visits_send",
        isAdvancingCurrentScreen: false,
        isPreparingSubmit: true,
        isSubmittingRequirement: false,
        isChoosingPlan: false,
      }),
    ).toBe(true);
  });
});

describe("place and date persistence", () => {
  it("sends the address, start, flexibility and hard deadline together", () => {
    const input = toPlaceAndDateSaveInput({
      requirementId: "requirement-42",
      addressId: "address-9",
      requestedStart: "2026-09-14",
      flexibilityDays: 7,
      serviceBy: "2026-10-30",
    });

    expect(input).toMatchObject({
      requirementId: "requirement-42",
      addressId: "address-9",
      flexibilityDays: 7,
      serviceBy: "2026-10-30",
    });
    expect(input?.requestedStart).toBe(new Date(2026, 8, 14).toISOString());
  });

  it("refuses an incomplete location section", () => {
    expect(
      toPlaceAndDateSaveInput({
        requirementId: "requirement-42",
        addressId: null,
        requestedStart: "2026-09-14",
        flexibilityDays: 0,
        serviceBy: null,
      }),
    ).toBeNull();
  });
});

describe("requirement submission preparation", () => {
  it("persists the final visible partner count before opening matching", async () => {
    const writes: string[] = [];

    await persistVisitPlanSelectionForSubmit({
      isA5: true,
      requirementId: "requirement-42",
      selectedPlanSize: 1,
      savedPlanSize: 3,
      choose: async ({ requirementId, planSize }) => {
        writes.push(`plan:${requirementId}:${planSize}`);
      },
    });
    writes.push("submit");

    expect(writes).toEqual(["plan:requirement-42:1", "submit"]);
  });

  it("does not rewrite a visit plan whose final count is already saved", async () => {
    let writes = 0;

    await persistVisitPlanSelectionForSubmit({
      isA5: true,
      requirementId: "requirement-42",
      selectedPlanSize: 1,
      savedPlanSize: 1,
      choose: async () => {
        writes += 1;
      },
    });

    expect(writes).toBe(0);
  });

  it("saves the answers and then the place before returning the draft to submit", async () => {
    const writes: string[] = [];

    const prepared = await prepareRequirementForSubmit({
      saveAnswers: async () => {
        writes.push("answers");
        return { requirementId: "requirement-42", isA5: true };
      },
      savePlaceAndDates: async (id) => {
        writes.push(`place:${id}`);
        return true;
      },
      onPlaceAndDateFailure: () => writes.push("show-place"),
    });

    expect(prepared).toEqual({ requirementId: "requirement-42", isA5: true });
    expect(writes).toEqual(["answers", "place:requirement-42"]);
  });

  it("stops submission and returns to location when that section cannot be saved", async () => {
    const writes: string[] = [];

    const prepared = await prepareRequirementForSubmit({
      saveAnswers: async () => ({ requirementId: "requirement-42", isA5: false }),
      savePlaceAndDates: async () => false,
      onPlaceAndDateFailure: () => writes.push("show-place"),
    });

    expect(prepared).toBeNull();
    expect(writes).toEqual(["show-place"]);
  });

  it("carries the saved draft's lifecycle so a first send can stop for the plan", async () => {
    // The submit path decides "does this need an estimate count?" from the
    // response to the save it just made — the render that started the send may
    // predate the draft existing at all.
    const prepared = await prepareRequirementForSubmit({
      saveAnswers: async () => ({ requirementId: "requirement-7", isA5: true }),
      savePlaceAndDates: async () => true,
      onPlaceAndDateFailure: () => undefined,
    });

    expect(prepared?.isA5).toBe(true);
  });
});
