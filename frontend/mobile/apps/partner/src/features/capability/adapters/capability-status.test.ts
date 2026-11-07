// Ported from frontend/apps/partner/features/capability/adapters/capability-status.test.ts
import type { CapabilityRecord, CapabilityStatus } from "./wire";
import {
  activeCapabilities,
  describeCapability,
  isExpired,
  mostUrgentCapability,
} from "./capability-status";

/**
 * Review states, and the exact next permitted action for each.
 *
 * Closes the correction/resubmit half of `M2-FE-114` and verifies `M2-FE-109`.
 */

const NOW = "2026-08-11T09:00:00Z";

function record(overrides: Partial<CapabilityRecord> = {}): CapabilityRecord {
  return {
    id: "c-1",
    variant_id: "v-1",
    variant_name: "Housekeeping staff",
    workspace_key: "A3_TIME_BLOCK",
    commercial_mode: "LEAD_ONLY",
    status: "REQUESTED",
    review_notes: "",
    suspension_reason_code: "",
    requires_insurance: true,
    max_crew_size: 12,
    max_project_value_paise: null,
    // Contract 1.23.0. **Empty means every area this Partner serves** — the
    // common case, and never "not covered". A non-empty list is an Operations
    // narrowing that can only ever subtract.
    service_area_ids: [],
    registration_answers: {},
    expires_at: null,
    // Published at contract 1.22.0 alongside the `REJECTED` status: raw fields
    // rather than a computed `EXPIRED` status, which is what Session B asked for
    // and what keeps the client from holding a vocabulary Django cannot confirm.
    expired_document_kinds: [],
    documents_expiring_on: null,
    last_transition: null,
    reviewed_at: null,
    updated_at: NOW,
    ...overrides,
  };
}

describe("every state has a next step", () => {
  const statuses: CapabilityStatus[] = [
    "REQUESTED",
    "UNDER_REVIEW",
    "CHANGES_REQUIRED",
    "APPROVED",
    "SUSPENDED",
    "REJECTED",
    "WITHDRAWN",
  ];

  it("says something specific for all seven", () => {
    for (const status of statuses) {
      const presentation = describeCapability(
        record({
          status,
          review_notes:
            status === "CHANGES_REQUIRED" || status === "REJECTED"
              ? "Your ID does not match."
              : "",
          suspension_reason_code: status === "SUSPENDED" ? "document_expired" : "",
        }),
        NOW,
      );

      expect(presentation.headline.length).toBeGreaterThan(0);
      expect(presentation.detail.length).toBeGreaterThan(0);
    }
  });

  it("tells a waiting Partner that waiting is correct", () => {
    // The state onboarding loses people in: "under review" with no indication
    // whether that is normal.
    for (const status of ["REQUESTED", "UNDER_REVIEW"] as const) {
      const presentation = describeCapability(record({ status }), NOW);
      expect(presentation.isWaiting).toBe(true);
      expect(presentation.action.kind).toBe("WAIT");
    }
  });
});

describe("correction and resubmit", () => {
  it("renders the reviewer's own words", () => {
    // A generic "some documents need attention" is exactly the copy that sends
    // someone back to re-upload the wrong thing.
    const note = "The address on your ID does not match your address proof.";
    const presentation = describeCapability(
      record({ status: "CHANGES_REQUIRED", review_notes: note }),
      NOW,
    );

    expect(presentation.detail).toBe(note);
    expect(presentation.action).toMatchObject({ kind: "FIX" });
  });

  it("names the backend problem when the reviewer left no note", () => {
    // A contract violation (0013 §B3 criterion 5). Inventing a plausible
    // correction would send the Partner to fix something at random.
    const presentation = describeCapability(
      record({ status: "CHANGES_REQUIRED", review_notes: "  " }),
      NOW,
    );

    expect(presentation.detail).toContain("did not say what");
    expect(presentation.detail).toContain("support");
  });
});

describe("suspension", () => {
  it("points at support rather than explaining itself", () => {
    // A suspension has an appeal path. A banner is the wrong surface for a
    // dispute.
    const presentation = describeCapability(
      record({ status: "SUSPENDED", suspension_reason_code: "insurance_lapsed" }),
      NOW,
    );

    expect(presentation.tone).toBe("danger");
    expect(presentation.isActive).toBe(false);
    expect(presentation.action).toEqual({ kind: "SUPPORT", label: "Contact support" });
  });

  it("says committed work is unaffected", () => {
    // The question a suspended Partner actually has.
    const presentation = describeCapability(
      record({ status: "SUSPENDED", suspension_reason_code: "x" }),
      NOW,
    );
    expect(presentation.detail).toContain("already committed");
  });
});

describe("expiry", () => {
  it("treats an approved capability past its clock as not authorized", () => {
    // Mirrors `assert_capability_active`, which refuses on exactly this.
    const expired = record({ status: "APPROVED", expires_at: "2026-08-10T09:00:00Z" });

    expect(isExpired(expired, NOW)).toBe(true);
    expect(describeCapability(expired, NOW).isActive).toBe(false);
    expect(describeCapability(expired, NOW).label).toBe("Expired");
  });

  it("leaves a future expiry alone", () => {
    const live = record({ status: "APPROVED", expires_at: "2026-09-01T09:00:00Z" });
    expect(isExpired(live, NOW)).toBe(false);
    expect(describeCapability(live, NOW).isActive).toBe(true);
  });

  it("measures against the server clock, not the device", () => {
    // A device a day fast would otherwise show a live capability as expired and
    // route the Partner to support for a problem that does not exist.
    const capability = record({ status: "APPROVED", expires_at: "2026-08-11T12:00:00Z" });

    expect(isExpired(capability, "2026-08-11T09:00:00Z")).toBe(false);
    expect(isExpired(capability, "2026-08-12T09:00:00Z")).toBe(true);
  });

  it("fails open on an unreadable timestamp", () => {
    // The server enforces expiry. Stranding an approved Partner because a
    // timestamp failed to parse would be the client inventing a refusal.
    expect(isExpired(record({ expires_at: "not-a-date" }), NOW)).toBe(false);
  });

  it("does not invent a sixth status", () => {
    // Expiry is derived presentation, never a `CapabilityStatus` the model does
    // not have. The record still reports what Django stored.
    const expired = record({ status: "APPROVED", expires_at: "2026-01-01T00:00:00Z" });
    expect(expired.status).toBe("APPROVED");
  });
});

describe("what is actually active", () => {
  it("counts only approved and unexpired", () => {
    const records = [
      record({ id: "a", status: "APPROVED" }),
      record({ id: "b", status: "APPROVED", expires_at: "2026-01-01T00:00:00Z" }),
      record({ id: "c", status: "UNDER_REVIEW" }),
      record({ id: "d", status: "SUSPENDED", suspension_reason_code: "x" }),
    ];

    expect(activeCapabilities(records, NOW).map((entry) => entry.id)).toEqual(["a"]);
  });
});

describe("what to surface on the home screen", () => {
  it("ranks something to fix above something to wait for", () => {
    const records = [
      record({ id: "waiting", status: "UNDER_REVIEW" }),
      record({ id: "fix", status: "CHANGES_REQUIRED", review_notes: "n" }),
    ];

    expect(mostUrgentCapability(records)?.id).toBe("fix");
  });

  it("says nothing when everything is approved", () => {
    // A home screen interrupted by a row that needs nobody is one people learn
    // to ignore.
    expect(mostUrgentCapability([record({ status: "APPROVED" })])).toBeNull();
  });
});
