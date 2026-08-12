import { describe, expect, it } from "vitest";

import type { CrewMemberInput, CrewMemberRecord } from "@/features/capability/adapters/wire";
import {
  canReportAttendance,
  crewProblems,
  describeRoster,
  probableDuplicate,
  sortForDisplay,
} from "./roster";

/**
 * The crew roster: identity, supervisors and archiving.
 *
 * Closes the blocked-assignment half of `M2-FE-114` and verifies `M2-FE-107`.
 */

function member(overrides: Partial<CrewMemberRecord> = {}): CrewMemberRecord {
  return {
    membership_id: "m-1",
    display_name: "Ramesh K.",
    phone_masked: "•••••• 4821",
    status: "ACTIVE",
    is_supervisor: false,
    skill_codes: [],
    documents_verified_at: null,
    added_at: "2026-08-01T06:00:00Z",
    ...overrides,
  };
}

function input(overrides: Partial<CrewMemberInput> = {}): CrewMemberInput {
  return {
    display_name: "Ramesh K.",
    phone_e164: "+919876543210",
    skill_codes: [],
    is_supervisor: false,
    ...overrides,
  };
}

describe("attendance readiness", () => {
  it("needs at least one active supervisor", () => {
    // A3 attendance is a supervisor action — "n of m present today". A roster
    // with nobody who can file it fails at seven in the morning on a site.
    expect(canReportAttendance([member()])).toBe(false);
    expect(canReportAttendance([member({ is_supervisor: true })])).toBe(true);
  });

  it("does not count an archived supervisor", () => {
    expect(
      canReportAttendance([member({ is_supervisor: true, status: "ARCHIVED" })]),
    ).toBe(false);
  });
});

describe("archiving", () => {
  it("keeps archived people readable", () => {
    // Seasonal labour is the normal case. A hidden archive is one that gets
    // re-entered by hand, which breaks the double-booking check.
    const view = describeRoster([
      member({ membership_id: "a" }),
      member({ membership_id: "b", status: "ARCHIVED" }),
    ]);

    expect(view.active.map((row) => row.membershipId)).toEqual(["a"]);
    expect(view.archived.map((row) => row.membershipId)).toEqual(["b"]);
  });

  it("keeps archived people out of the active roster", () => {
    const view = describeRoster([member({ status: "ARCHIVED" })]);
    expect(view.active).toEqual([]);
    expect(view.isEmpty).toBe(false);
  });
});

describe("validation", () => {
  it("accepts an Indian mobile in E.164", () => {
    expect(crewProblems(input())).toEqual([]);
  });

  it("rejects a number that is not a mobile", () => {
    // The number is the identity that makes cross-agency double-booking
    // detectable. A landline resolving to an office is worse than a rejection.
    for (const phone of ["+911234567890", "9876543210", "+9198765432", "+1234567890"]) {
      expect(crewProblems(input({ phone_e164: phone })), phone).not.toEqual([]);
    }
  });

  it("rejects a name too short to identify anyone", () => {
    expect(crewProblems(input({ display_name: "R" }))[0]?.field).toBe("display_name");
  });

  it("does not require skills", () => {
    // Three fields, filled in on a site with one hand free. A longer form is one
    // filled in with placeholder names.
    expect(crewProblems(input({ skill_codes: [] }))).toEqual([]);
  });
});

describe("the duplicate hint", () => {
  it("matches on the digits the server actually sent", () => {
    const existing = [member({ display_name: "Ramesh K.", phone_masked: "•••••• 4821" })];
    expect(probableDuplicate(existing, "+919876544821")?.display_name).toBe("Ramesh K.");
  });

  it("does not match a different number", () => {
    const existing = [member({ phone_masked: "•••••• 4821" })];
    expect(probableDuplicate(existing, "+919876543210")).toBeNull();
  });

  it("says nothing about a number too short to compare", () => {
    expect(probableDuplicate([member()], "+91")).toBeNull();
  });
});

describe("display order", () => {
  it("puts supervisors first, then names", () => {
    const ordered = sortForDisplay([
      member({ membership_id: "c", display_name: "Venkat" }),
      member({ membership_id: "a", display_name: "Anil" }),
      member({ membership_id: "s", display_name: "Zubair", is_supervisor: true }),
    ]);

    expect(ordered.map((entry) => entry.membership_id)).toEqual(["s", "a", "c"]);
  });
});

describe("what the roster publishes", () => {
  it("carries a masked phone and no global identity", () => {
    // Publishing `crew_member_id` to one agency would let two agencies correlate
    // rosters and discover a worker is on both.
    const [row] = describeRoster([member()]).active;

    expect(row?.phoneMasked).toBe("•••••• 4821");
    expect(Object.keys(row ?? {})).not.toContain("crewMemberId");
  });

  it("never reports unchecked documents as verified", () => {
    expect(describeRoster([member()]).active[0]?.documentsVerified).toBe(false);
    expect(
      describeRoster([member({ documents_verified_at: "2026-08-02T00:00:00Z" })]).active[0]
        ?.documentsVerified,
    ).toBe(true);
  });
});
