import { describe, expect, it } from "vitest";

import {
  BUCKET_ORDER,
  CLOSING_SOON_MS,
  bucketOf,
  deadlineStateFor,
  describeDeadline,
  describeStatus,
  groupIntoBuckets,
  isEnquiryClosed,
  permissionsFor,
  type EnquiryStatus,
} from "./enquiry-state";

/**
 * What a screen may offer against an enquiry.
 *
 * Every case below mirrors a guard in `apps/requirements/matching.py` or
 * `apps/requirements/proposals.py`. The property under test is that this module
 * only ever *narrows* what Django would allow — a control it hides can never be
 * one the server would have honoured, and a control it shows must not be one the
 * server refuses on sight.
 */

const ALL: EnquiryStatus[] = [
  "INVITED",
  "ACCEPTED",
  "QUOTED",
  "DECLINED",
  "EXPIRED",
  "WITHDRAWN",
];

describe("accepting", () => {
  it("is offered only from INVITED", () => {
    // `matching.accept_invitation` raises for anything else, and returns the
    // invitation unchanged for a second accept.
    const offered = ALL.filter((status) => permissionsFor(status).canAccept);
    expect(offered).toEqual(["INVITED"]);
  });
});

describe("declining", () => {
  it("is offered from INVITED and ACCEPTED", () => {
    const offered = ALL.filter((status) => permissionsFor(status).canDecline);
    expect(offered).toEqual(["INVITED", "ACCEPTED"]);
  });

  it("is not offered once a quote is in", () => {
    // `decline_invitation` refuses QUOTED outright: "Withdraw the quote instead
    // of declining." Offering Decline there is offering a button whose only
    // outcome is that refusal.
    expect(permissionsFor("QUOTED").canDecline).toBe(false);
  });
});

describe("quoting", () => {
  it("needs an accepted or already-quoted enquiry", () => {
    // `submit_proposal` raises "Accept this enquiry before quoting on it."
    const offered = ALL.filter((status) => permissionsFor(status).canQuote);
    expect(offered).toEqual(["ACCEPTED", "QUOTED"]);
  });
});

describe("asking a question", () => {
  it("is offered wherever the vendor is still in", () => {
    expect(permissionsFor("INVITED").canAsk).toBe(true);
    expect(permissionsFor("ACCEPTED").canAsk).toBe(true);
    expect(permissionsFor("QUOTED").canAsk).toBe(true);
  });

  it("is withdrawn once the vendor is out", () => {
    for (const status of ["DECLINED", "EXPIRED", "WITHDRAWN"] as EnquiryStatus[]) {
      expect(permissionsFor(status).canAsk).toBe(false);
    }
  });
});

describe("requesting a site visit", () => {
  it("is offered before the quote goes in, not after", () => {
    // The server has no status guard at all on `request_site_visit`. This
    // narrows to where the visit has a purpose rather than everywhere the
    // server would tolerate one.
    expect(permissionsFor("INVITED").canRequestSiteVisit).toBe(true);
    expect(permissionsFor("ACCEPTED").canRequestSiteVisit).toBe(true);
    expect(permissionsFor("QUOTED").canRequestSiteVisit).toBe(false);
  });
});

describe("status copy", () => {
  it("gives every status its own sentence", () => {
    const meanings = new Set(ALL.map((status) => describeStatus(status).meaning));
    expect(meanings.size).toBe(ALL.length);
  });

  it("does not tell a vendor they were too slow when they were not", () => {
    // EXPIRED is the vendor running out of time. WITHDRAWN is Vsolve pulling
    // the enquiry back because the requirement changed, which carries no
    // penalty. Collapsing them is a false accusation.
    expect(describeStatus("EXPIRED").meaning).toMatch(/closed before you answered/i);
    expect(describeStatus("WITHDRAWN").meaning).toMatch(/does not count against you/i);
  });

  it("never renders an archetype or a database value", () => {
    for (const status of ALL) {
      const copy = describeStatus(status);
      expect(copy.label).not.toMatch(/A3|A5|_/);
      expect(copy.label).not.toBe(status);
    }
  });
});

describe("buckets", () => {
  it("puts every status somewhere", () => {
    for (const status of ALL) {
      expect(BUCKET_ORDER.map((bucket) => bucket.key)).toContain(bucketOf(status));
    }
  });

  it("separates what needs an answer from what is merely in progress", () => {
    expect(bucketOf("INVITED")).toBe("needs_response");
    expect(bucketOf("ACCEPTED")).toBe("accepted");
    expect(bucketOf("QUOTED")).toBe("quoted");
  });

  it("collects all three terminal statuses into one closed bucket", () => {
    expect(bucketOf("DECLINED")).toBe("closed");
    expect(bucketOf("EXPIRED")).toBe("closed");
    expect(bucketOf("WITHDRAWN")).toBe("closed");
  });

  it("keeps server order inside a bucket", () => {
    const grouped = groupIntoBuckets([
      { id: "a", status: "INVITED" as EnquiryStatus },
      { id: "b", status: "QUOTED" as EnquiryStatus },
      { id: "c", status: "INVITED" as EnquiryStatus },
    ]);
    expect(grouped.get("needs_response")?.map((row) => row.id)).toEqual(["a", "c"]);
  });

  it("omits a bucket nothing falls into rather than creating an empty one", () => {
    const grouped = groupIntoBuckets([{ status: "INVITED" as EnquiryStatus }]);
    expect(grouped.has("closed")).toBe(false);
  });
});

describe("deadlines", () => {
  it("treats a missing deadline as a real state, not a zero", () => {
    // `matching._invitation_deadline` returns None whenever the service area
    // publishes no operating window or the configuration carries no SLA hours.
    // Rendering "0:00" there would invent an expiry nobody set.
    expect(deadlineStateFor({ respondsBy: null, remainingMs: null })).toBe("none");
    expect(deadlineStateFor({ respondsBy: "2026-08-14T09:00:00Z", remainingMs: null })).toBe(
      "none",
    );
  });

  it("marks the last hour as closing", () => {
    expect(
      deadlineStateFor({ respondsBy: "2026-08-14T09:00:00Z", remainingMs: CLOSING_SOON_MS - 1 }),
    ).toBe("closing");
    expect(
      deadlineStateFor({ respondsBy: "2026-08-14T09:00:00Z", remainingMs: CLOSING_SOON_MS + 1 }),
    ).toBe("open");
  });

  it("treats zero as passed, and passed as our clock's opinion", () => {
    expect(deadlineStateFor({ respondsBy: "2026-08-14T09:00:00Z", remainingMs: 0 })).toBe("passed");
    // The backend owns expiry. The copy must not announce it.
    expect(describeDeadline("passed")).toMatch(/Vsolve decides when an enquiry actually expires/i);
    expect(describeDeadline("passed")).not.toMatch(/has expired|is expired|is gone\./i);
  });

  it("says business hours are why the countdown is not a straight duration", () => {
    // `add_business_hours` computes `responds_by` inside the area's operating
    // windows, so "6 hours left" across a Sunday is a lie a bare countdown
    // tells by itself.
    expect(describeDeadline("open")).toMatch(/working hours/i);
  });
});

describe("closed enquiries", () => {
  it("names the three statuses a vendor is out of", () => {
    expect(ALL.filter(isEnquiryClosed)).toEqual(["DECLINED", "EXPIRED", "WITHDRAWN"]);
  });
});
