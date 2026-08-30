import { describe, expect, it } from "vitest";
import type { Schemas } from "@vsolve/api-client";

import { stageDeadline } from "./m2-stage-deadline";

const stage: Schemas["EngagementStage"] = {
  id: "stage-1",
  position: 1,
  label: "First fix",
  amount_paise: 100_000,
  // Required since 1.44.0: an installment now publishes the immutable split it
  // was funded on, so a receipt can be reproduced from the stage alone.
  funding_breakdown: {
    partner_service_paise: 100_000,
    tax_paise: 18_000,
    platform_fee_paise: 0,
    total_due_paise: 118_000,
  },
  // Nullable since 1.49.0: a project milestone has no shift-day summary.
  shift_summary: null,
  kind: "WORK",
  starts_on: "2026-08-21",
  duration_days: 5,
  scheduled_on: "2026-08-25",
  status: "IN_PROGRESS",
  funding_state: "FUNDED",
  funded_paise: 100_000,
  approved_amount_paise: 0,
  released_amount_paise: 0,
  refunded_amount_paise: 0,
  correction_note: "",
  dispute_reason_code: "",
  review_due_at: null,
  payout_release_due_at: null,
  evidence: [],
  funded_at: null,
  started_at: null,
  evidence_submitted_at: null,
  approved_at: null,
  released_at: null,
  disputed_at: null,
};

describe("stageDeadline", () => {
  it("counts calendar days remaining from the server date", () => {
    expect(stageDeadline(stage, "2026-08-21T09:00:00Z")?.label).toBe("4 days left");
  });

  it("describes days after the agreement deadline as extra days", () => {
    expect(stageDeadline(stage, "2026-08-26T09:00:00Z")?.label).toBe("1 extra day");
  });

  it("does not call an already settled stage late", () => {
    expect(
      stageDeadline({ ...stage, status: "RELEASED" }, "2026-08-30T09:00:00Z")?.state,
    ).toBe("complete");
  });
});
