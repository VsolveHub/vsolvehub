import { describe, expect, it } from "vitest";

import type { CrewOffer } from "@/features/crew-offer/queries";
import type { EnquirySummary } from "@/features/enquiry/queries";
import type { Engagement } from "@/features/engagement/queries";
import type { Offer } from "@/features/offers/queries";
import type { PartnerVisit } from "@/features/work/queries";

import { toWorkItems } from "./work-item";

/**
 * The merged WORK stack.
 *
 * ## Why every fixture below is typed rather than cast
 *
 * The draft these tests were written from built its fixtures with `as never`,
 * which types out to "trust me". It could not have caught the three defects this
 * file now guards, because all three are *shapes the compiler already knew*:
 * `IN_PROGRESS` is not an `EngagementStatusEnum` member, `commercial_mode` is
 * `LEAD_ONLY | MANAGED_PAYMENT_REQUIRED`, and `EnquirySummary.responds_by` is
 * not nullable. A typed builder makes the fixture itself an assertion about the
 * published contract, so a schema regeneration that moves a field fails here
 * rather than eight screens downstream.
 */

const NOW = "2026-08-19T10:00:00Z";

function offer(overrides: Partial<CrewOffer> = {}): CrewOffer {
  return {
    invitation_id: "o1",
    requirement_id: "r1",
    status: "INVITED",
    decline_reason_code: "",
    headcount: 2,
    days: 1,
    lead_day_receipt_paise: 180_000,
    lead_total_receipt_paise: 180_000,
    standard_day_hours: 8,
    overtime_hourly_paise: 0,
    inclusions: [],
    responds_by: "2026-08-19T10:02:00Z",
    verified_roster_size: 4,
    requested_start: "2026-08-20T00:00:00Z",
    area_label: "Kondapur",
    server_now: NOW,
    ...overrides,
  };
}

/**
 * An A1 direct offer. Shares no field name with `offer()` above — the id is
 * `id`, the deadline is `expires_at`, the start is `starts_at`, the area is
 * `approximate_area`, and the money is a `Money` object rather than a paise int.
 */
function directOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "d1",
    checkout_id: "c1",
    fulfilment_unit_id: "u1",
    unit_position: 1,
    starts_at: "2026-08-20T09:00:00Z",
    estimated_duration_minutes: 90,
    approximate_area: "Madhapur",
    service_lines: [
      { line_id: "sl1", service_label: "Bathroom deep clean", quantity: 1, scope: {} },
    ],
    requirements: [],
    estimated_gross: { amount_paise: 300_000, currency: "INR" },
    commission: { amount_paise: 45_000, currency: "INR" },
    estimated_net: { amount_paise: 255_000, currency: "INR" },
    status: "OFFERED",
    expires_at: "2026-08-19T10:03:00Z",
    undo_deadline: null,
    created_at: "2026-08-19T09:58:00Z",
    server_now: NOW,
    ...overrides,
  };
}

function enquiry(overrides: Partial<EnquirySummary> = {}): EnquirySummary {
  return {
    id: "e1",
    requirement_id: "r2",
    category_slug: "deep-cleaning",
    service_name: "Deep clean",
    archetype: "A5_CUSTOM_PROJECT",
    status: "INVITED",
    wave: 1,
    requested_start: "2026-08-22T04:00:00Z",
    service_by: "2026-08-25",
    language: "en",
    responds_by: "2026-08-20T10:00:00Z",
    created_at: "2026-08-19T06:00:00Z",
    ...overrides,
  };
}

function engagement(overrides: Partial<Engagement> = {}): Engagement {
  return {
    id: "g1",
    requirement: "r3",
    proposal: "p1",
    partner: "v1",
    archetype: "A3_WORKFORCE",
    commercial_mode: "MANAGED_PAYMENT_REQUIRED",
    status: "ACTIVE",
    total_paise: 2_000_000,
    tax_paise: 0,
    tax_basis: "EXCLUSIVE",
    commission_paise: 200_000,
    commission_treatment: "DEDUCTED",
    staged_total_paise: 2_160_000,
    amendment_delta_paise: 160_000,
    funded_total_paise: 0,
    approved_total_paise: 0,
    released_total_paise: 0,
    refunded_total_paise: 0,
    contact_released_at: null,
    work_may_start_at: null,
    disputed_at: null,
    completed_at: null,
    access_receipt: null,
    stages: [],
    created_at: "2026-08-15T06:00:00Z",
    ...overrides,
  };
}

function job(overrides: Partial<PartnerVisit> = {}): PartnerVisit {
  return {
    id: "j1",
    fulfilment_unit_id: null,
    status: "COMPLETED",
    version: 3,
    scheduled_start: "2026-08-18T09:00:00Z",
    estimated_duration_minutes: 120,
    en_route_at: null,
    arrived_at: null,
    customer_unavailable_wait_started_at: null,
    late_declared_at: null,
    work_tasks: [],
    evidence: [],
    active_amendment: null,
    earning: {
      gross_paise: 700_000,
      commission_paise: 100_000,
      net_paise: 600_000,
      currency: "INR",
      status: "SETTLED",
      calculation_snapshot: null,
    },
    server_now: NOW,
    ...overrides,
  };
}

const EMPTY = {
  offers: [] as readonly CrewOffer[],
  offersServerNow: null,
  directOffers: [] as readonly Offer[],
  enquiries: [] as readonly EnquirySummary[],
  engagements: [] as readonly Engagement[],
  jobs: [] as readonly PartnerVisit[],
};

describe("toWorkItems — urgency ordering", () => {
  it("puts a live offer ahead of an unpriced enquiry ahead of a doing engagement ahead of a settled job", () => {
    const items = toWorkItems({
      offers: [offer()],
      offersServerNow: NOW,
      directOffers: [],
      enquiries: [enquiry()],
      engagements: [engagement()],
      jobs: [job()],
    });

    expect(items.map((item) => item.kind)).toEqual(["offer", "enquiry", "engagement", "job"]);
  });

  it("ranks by urgency before it looks at any clock", () => {
    // The settled job's deadline is the earliest instant in the set and the live
    // offer's is the latest. Rank has to win, or a finished job outranks a
    // dispatch that expires in ninety seconds.
    const items = toWorkItems({
      ...EMPTY,
      offers: [offer({ responds_by: "2026-08-19T10:05:00Z" })],
      offersServerNow: NOW,
      jobs: [job({ status: "COMPLETED", scheduled_start: "2026-01-01T00:00:00Z" })],
    });

    expect(items.map((item) => item.urgency)).toEqual(["live", "settled"]);
  });

  it("renders nothing rather than guessing when every source is empty", () => {
    expect(toWorkItems(EMPTY)).toEqual([]);
  });
});

describe("toWorkItems — crew offers", () => {
  it("puts the offer closest to expiring first", () => {
    const items = toWorkItems({
      ...EMPTY,
      offers: [
        offer({ invitation_id: "late", responds_by: "2026-08-19T10:09:00Z" }),
        offer({ invitation_id: "soon", responds_by: "2026-08-19T10:01:00Z" }),
        offer({ invitation_id: "middle", responds_by: "2026-08-19T10:04:00Z" }),
      ],
      offersServerNow: NOW,
    });

    expect(items.map((item) => item.key)).toEqual([
      "offer:soon",
      "offer:middle",
      "offer:late",
    ]);
  });

  it("drops an offer whose deadline has already passed", () => {
    const items = toWorkItems({
      ...EMPTY,
      offers: [offer({ responds_by: "2026-08-19T09:00:00Z" })],
      offersServerNow: NOW,
    });

    expect(items).toHaveLength(0);
  });

  it("drops an offer this lead has already answered", () => {
    // `isOfferLive` fails closed on anything but INVITED. The list endpoint
    // filters server-side too, but the cached page is up to fifteen seconds old.
    const items = toWorkItems({
      ...EMPTY,
      offers: [offer({ status: "DECLINED" }), offer({ status: "EXPIRED" })],
      offersServerNow: NOW,
    });

    expect(items).toHaveLength(0);
  });

  it("drops every offer rather than judging a dispatch clock against the device", () => {
    // No `server_now` means the offers read has not landed. A phone with a
    // skewed clock would otherwise show dead offers or hide live ones.
    const items = toWorkItems({ ...EMPTY, offers: [offer()], offersServerNow: null });

    expect(items).toHaveLength(0);
  });

  it("carries the lead's own total and the published area", () => {
    const [item] = toWorkItems({
      ...EMPTY,
      offers: [offer({ lead_total_receipt_paise: 540_000, area_label: "Gachibowli" })],
      offersServerNow: NOW,
    });

    expect(item?.amountPaise).toBe(540_000);
    expect(item?.areaLabel).toBe("Gachibowli");
    expect(item?.href).toBe("/work/offers/o1");
  });

  it("reads a blank area label as no area, not as an empty one", () => {
    const [item] = toWorkItems({
      ...EMPTY,
      offers: [offer({ area_label: "" })],
      offersServerNow: NOW,
    });

    expect(item?.areaLabel).toBeNull();
  });
});

describe("toWorkItems — A1 direct offers", () => {
  it("keeps an offered one and the one still inside its undo window", () => {
    // `isOfferSettled`'s survivors. `ACCEPTED_PENDING_UNDO` is deliberately not
    // settled — that module documents the undo window as expiring on a server
    // timer into a commitment, so it is still live work.
    const items = toWorkItems({
      ...EMPTY,
      directOffers: [
        directOffer({ id: "fresh", status: "OFFERED", expires_at: "2026-08-19T10:01:00Z" }),
        directOffer({
          id: "undoable",
          status: "ACCEPTED_PENDING_UNDO",
          expires_at: "2026-08-19T09:50:00Z",
          undo_deadline: "2026-08-19T10:02:00Z",
        }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual(["direct-offer:fresh", "direct-offer:undoable"]);
    expect(items.every((item) => item.urgency === "live")).toBe(true);
  });

  it("drops every settled status", () => {
    const items = toWorkItems({
      ...EMPTY,
      directOffers: [
        directOffer({ id: "a", status: "COMMITTED" }),
        directOffer({ id: "b", status: "DECLINED" }),
        directOffer({ id: "c", status: "UNDONE" }),
        directOffer({ id: "d", status: "EXPIRED" }),
        directOffer({ id: "e", status: "REVOKED" }),
      ],
    });

    expect(items).toHaveLength(0);
  });

  it("races the undo clock once accepted, not the offer window it already answered", () => {
    // `expires_at` is in the past for an accepted offer — the vendor answered
    // inside it. Sorting on that would pin the card to the top of the stack
    // behind a countdown that has already run out.
    const [item] = toWorkItems({
      ...EMPTY,
      directOffers: [
        directOffer({
          status: "ACCEPTED_PENDING_UNDO",
          expires_at: "2026-08-19T09:50:00Z",
          undo_deadline: "2026-08-19T10:02:00Z",
        }),
      ],
    });

    expect(item?.respondsBy).toBe("2026-08-19T10:02:00Z");
  });

  it("carries the server's own net figure, and the approximate area", () => {
    const [item] = toWorkItems({ ...EMPTY, directOffers: [directOffer()] });

    // `estimated_net`, not `estimated_gross` (300000) and not `commission`
    // (45000). The subtraction is the server's.
    expect(item?.amountPaise).toBe(255_000);
    expect(item?.areaLabel).toBe("Madhapur");
    expect(item?.whenIso).toBe("2026-08-20T09:00:00Z");
    expect(item?.href).toBe("/work/offers");
  });

  it("reads a missing area and an unpriced unit as absent, not as zero", () => {
    const [item] = toWorkItems({
      ...EMPTY,
      directOffers: [directOffer({ approximate_area: null, estimated_net: null })],
    });

    expect(item?.areaLabel).toBeNull();
    expect(item?.amountPaise).toBeNull();
  });

  it("interleaves with A3 crew offers by deadline rather than by source", () => {
    // Both sources are `live`, so the comparator orders them together on
    // `respondsBy` without knowing which inbox produced which row. An A1 offer
    // expiring in seconds must outrank an A3 one with a minute left.
    const items = toWorkItems({
      ...EMPTY,
      offers: [
        offer({ invitation_id: "crew-late", responds_by: "2026-08-19T10:08:00Z" }),
        offer({ invitation_id: "crew-early", responds_by: "2026-08-19T10:02:00Z" }),
      ],
      offersServerNow: NOW,
      directOffers: [
        directOffer({ id: "direct-urgent", expires_at: "2026-08-19T10:00:30Z" }),
        directOffer({ id: "direct-later", expires_at: "2026-08-19T10:05:00Z" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual([
      "direct-offer:direct-urgent",
      "offer:crew-early",
      "direct-offer:direct-later",
      "offer:crew-late",
    ]);
    expect(items.every((item) => item.kind === "offer")).toBe(true);
  });

  it("still outranks everything that is not an offer", () => {
    const items = toWorkItems({
      ...EMPTY,
      directOffers: [directOffer()],
      enquiries: [enquiry()],
      engagements: [engagement()],
      jobs: [job()],
    });

    expect(items.map((item) => item.urgency)).toEqual([
      "live",
      "needs_price",
      "doing",
      "settled",
    ]);
  });
});

describe("toWorkItems — enquiries", () => {
  it("keeps the two buckets where the ball is with this vendor", () => {
    const items = toWorkItems({
      ...EMPTY,
      enquiries: [
        enquiry({ id: "invited", status: "INVITED", responds_by: "2026-08-20T10:00:00Z" }),
        enquiry({ id: "accepted", status: "ACCEPTED", responds_by: "2026-08-21T10:00:00Z" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual(["enquiry:invited", "enquiry:accepted"]);
  });

  it("drops an enquiry this vendor has already quoted, declined or lost", () => {
    const items = toWorkItems({
      ...EMPTY,
      enquiries: [
        enquiry({ id: "q", status: "QUOTED" }),
        enquiry({ id: "d", status: "DECLINED" }),
        enquiry({ id: "x", status: "EXPIRED" }),
        enquiry({ id: "w", status: "WITHDRAWN" }),
      ],
    });

    expect(items).toHaveLength(0);
  });

  it("sorts the oldest deadline first", () => {
    const items = toWorkItems({
      ...EMPTY,
      enquiries: [
        enquiry({ id: "later", responds_by: "2026-08-24T10:00:00Z" }),
        enquiry({ id: "sooner", responds_by: "2026-08-20T10:00:00Z" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual(["enquiry:sooner", "enquiry:later"]);
  });

  it("never carries a price or an area label for a kind that publishes neither", () => {
    const [item] = toWorkItems({ ...EMPTY, enquiries: [enquiry()] });

    expect(item?.amountPaise).toBeNull();
    expect(item?.areaLabel).toBeNull();
    expect(item?.href).toBe("/work/enquiries/e1");
  });
});

describe("toWorkItems — engagements", () => {
  it("keeps every status that is still this vendor's open business", () => {
    // The regression this file exists for. `IN_PROGRESS` is an
    // `EngagementStageStatusEnum` member, **not** an engagement status, so a
    // filter written against it silently hides every engagement being worked on.
    const items = toWorkItems({
      ...EMPTY,
      engagements: [
        engagement({ id: "pending", status: "PENDING_START" }),
        engagement({ id: "active", status: "ACTIVE" }),
        engagement({ id: "completing", status: "COMPLETING" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual([
      "engagement:pending",
      "engagement:active",
      "engagement:completing",
    ]);
    expect(items.every((item) => item.urgency === "doing")).toBe(true);
  });

  it("drops an engagement that is over or in dispute", () => {
    const items = toWorkItems({
      ...EMPTY,
      engagements: [
        engagement({ id: "done", status: "COMPLETED" }),
        engagement({ id: "warranty", status: "WARRANTY" }),
        engagement({ id: "closed", status: "CLOSED" }),
        engagement({ id: "disputed", status: "DISPUTED" }),
        engagement({ id: "cancelled", status: "CANCELLED" }),
      ],
    });

    expect(items).toHaveLength(0);
  });

  it("shows what the work is against today, never the platform's commission", () => {
    // `commission_paise` is Vsolve's cut, and is server-documented as zero for
    // the whole `LEAD_ONLY` path — so as a headline figure it is either the
    // wrong number or no number at all. `staged_total_paise` is the agreed
    // total; see `WorkItem.amountPaise` for why that is still not a guaranteed
    // net payout for an engagement.
    const [item] = toWorkItems({
      ...EMPTY,
      engagements: [
        engagement({
          total_paise: 2_000_000,
          amendment_delta_paise: 160_000,
          staged_total_paise: 2_160_000,
          commission_paise: 200_000,
        }),
      ],
    });

    expect(item?.amountPaise).toBe(2_160_000);
  });

  it("gives an engagement no schedule, because the agreement publishes none", () => {
    const [item] = toWorkItems({ ...EMPTY, engagements: [engagement()] });

    expect(item?.whenIso).toBeNull();
    expect(item?.respondsBy).toBeNull();
    expect(item?.areaLabel).toBeNull();
  });
});

describe("toWorkItems — A1 visits", () => {
  it("splits one bucket of jobs into doing and settled", () => {
    const items = toWorkItems({
      ...EMPTY,
      jobs: [
        job({ id: "done", status: "COMPLETED" }),
        job({ id: "onsite", status: "IN_PROGRESS", scheduled_start: "2026-08-19T08:00:00Z" }),
      ],
    });

    expect(items.map((item) => [item.key, item.urgency])).toEqual([
      ["job:onsite", "doing"],
      ["job:done", "settled"],
    ]);
  });

  it("keeps every visit status that is still this Partner's to finish", () => {
    // `ABORTED` and `COMPLETION_SUBMITTED` are the two that look finished and
    // are not. `canReportCompletion` (`work/queries.ts:68-70`) returns true for
    // `ABORTED`, so that Partner still owes the report that settles the money —
    // and dropping it made the job vanish from the one screen listing work, at
    // the moment they needed to act on it. `COMPLETION_SUBMITTED` is the state
    // immediately after filing that report, so dropping it made the card blink
    // out just as they looked for confirmation.
    const items = toWorkItems({
      ...EMPTY,
      jobs: [
        job({ id: "confirmed", status: "CONFIRMED", scheduled_start: "2026-08-20T01:00:00Z" }),
        job({ id: "enroute", status: "EN_ROUTE", scheduled_start: "2026-08-20T02:00:00Z" }),
        job({ id: "arrived", status: "ARRIVED", scheduled_start: "2026-08-20T03:00:00Z" }),
        job({ id: "onsite", status: "IN_PROGRESS", scheduled_start: "2026-08-20T04:00:00Z" }),
        job({ id: "aborted", status: "ABORTED", scheduled_start: "2026-08-20T05:00:00Z" }),
        job({ id: "filed", status: "COMPLETION_SUBMITTED", scheduled_start: "2026-08-20T06:00:00Z" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual([
      "job:confirmed",
      "job:enroute",
      "job:arrived",
      "job:onsite",
      "job:aborted",
      "job:filed",
    ]);
    expect(items.every((item) => item.urgency === "doing")).toBe(true);
  });

  it("sorts the next job soonest-first and finished ones newest-first", () => {
    const items = toWorkItems({
      ...EMPTY,
      jobs: [
        job({ id: "later", status: "CONFIRMED", scheduled_start: "2026-08-25T09:00:00Z" }),
        job({ id: "next", status: "CONFIRMED", scheduled_start: "2026-08-20T09:00:00Z" }),
        job({ id: "old", status: "COMPLETED", scheduled_start: "2026-08-10T09:00:00Z" }),
        job({ id: "recent", status: "PARTIALLY_COMPLETED", scheduled_start: "2026-08-18T09:00:00Z" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual([
      "job:next",
      "job:later",
      "job:recent",
      "job:old",
    ]);
  });

  it("drops a job in a state this stack has no card for", () => {
    // The complete excluded set. All three need a card that says something about
    // money moving backwards or an Operations case, which is a product decision
    // this adapter must not invent.
    const items = toWorkItems({
      ...EMPTY,
      jobs: [
        job({ id: "cancelled", status: "CANCELLED" }),
        job({ id: "disputed", status: "DISPUTED" }),
        job({ id: "recovery", status: "RECOVERY_REQUIRED" }),
      ],
    });

    expect(items).toHaveLength(0);
  });

  it("carries the Partner's net earning, and nothing at all before it settles", () => {
    const [settled] = toWorkItems({ ...EMPTY, jobs: [job()] });
    const [unsettled] = toWorkItems({
      ...EMPTY,
      jobs: [job({ id: "j2", status: "CONFIRMED", earning: null })],
    });

    expect(settled?.amountPaise).toBe(600_000);
    expect(unsettled?.amountPaise).toBeNull();
    expect(settled?.href).toBe("/work/jobs/j1");
  });
});

describe("toWorkItems — keys", () => {
  it("namespaces the key by source, so five records with one id cannot collide", () => {
    // The two offer sources share `kind: "offer"`, so keying on kind alone would
    // produce `offer:same` twice and hand React two children with one key.
    const items = toWorkItems({
      ...EMPTY,
      offers: [offer({ invitation_id: "same" })],
      offersServerNow: NOW,
      directOffers: [directOffer({ id: "same" })],
      enquiries: [enquiry({ id: "same" })],
      engagements: [engagement({ id: "same" })],
      jobs: [job({ id: "same" })],
    });

    expect(items.map((item) => item.key)).toEqual([
      "offer:same",
      "direct-offer:same",
      "enquiry:same",
      "engagement:same",
      "job:same",
    ]);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });
});
