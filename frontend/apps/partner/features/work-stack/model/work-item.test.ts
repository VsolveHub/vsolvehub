import { describe, expect, it } from "vitest";

import type { CrewOffer } from "@/features/crew-offer/queries";
import type { EnquirySummary } from "@/features/enquiry/queries";
import type { Engagement, EngagementStage } from "@/features/engagement/queries";
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
    brief: [],
    crew_mix: [],
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
    approximate_area: "Kukatpally, Hyderabad",
    archetype: "A5_CUSTOM_PROJECT",
    requirement_status: "MATCHING",
    fixed_visit_start: null,
    fixed_visit_duration_minutes: null,
    fixed_visit_earning_paise: null,
    fixed_visit_status: null,
    status: "INVITED",
    wave: 1,
    requested_start: "2026-08-22T04:00:00Z",
    service_by: "2026-08-25",
    responds_by: "2026-08-20T10:00:00Z",
    pricing_skill_code: "electrician",
    material_fulfilment_mode: "PARTNER_TURNKEY",
    latest_proposal_status: null,
    latest_proposal_rejection_reason: null,
    created_at: "2026-08-19T06:00:00Z",
    ...overrides,
  };
}

function engagement(overrides: Partial<Engagement> = {}): Engagement {
  return {
    id: "g1",
    requirement: "r3",
    service_name: "Full home rewiring",
    service_slug: "full-home-rewiring",
    crew_terms: null,
    site_address: null,
    customer_contact: null,
    partner_contact: null,
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
    server_now: NOW,
    stages: [],
    created_at: "2026-08-15T06:00:00Z",
    ...overrides,
  };
}

/** One A3 shift-day, settled or not, with the 1.49.0 `shift_summary` on it. */
function shiftDay(
  overrides: Partial<EngagementStage> & {
    summary?: Partial<NonNullable<EngagementStage["shift_summary"]>>;
  } = {},
): EngagementStage {
  const { summary, ...rest } = overrides;
  return {
    id: "s1",
    position: 1,
    label: "Day 1",
    amount_paise: 300_000,
    funding_breakdown: null,
    shift_summary: {
      crew_named: 5,
      expected_count: 5,
      arrived_at: "2026-08-19T03:30:00Z",
      present_count: 5,
      attendance_status: "CUSTOMER_CONFIRMED",
      settlement_status: "SETTLED",
      settlement_amount_paise: 300_000,
      shortfall_choice: "",
      ...summary,
    },
    kind: "WORK",
    starts_on: null,
    duration_days: 1,
    scheduled_on: "2026-08-19",
    status: "RELEASED",
    funding_state: "NOT_REQUIRED",
    funded_paise: 0,
    approved_amount_paise: 300_000,
    released_amount_paise: 300_000,
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
    ...rest,
  };
}

const CREW_TERMS: NonNullable<Engagement["crew_terms"]> = {
  headcount: 5,
  days: 3,
  per_worker_day_paise: 60_000,
  lead_day_receipt_paise: 300_000,
  lead_receipt_paise: 900_000,
  booking_fee_paise: 50_000,
  total_customer_paise: 950_000,
  standard_day_hours: 8,
  overtime_hourly_paise: 10_000,
  add_on_rates: {},
  inclusions: ["Loading & shifting", "Own tools"],
};

function job(overrides: Partial<PartnerVisit> = {}): PartnerVisit {
  return {
    id: "j1",
    fulfilment_unit_id: null,
    display_title: "Bathroom deep clean",
    approximate_area: "Madhapur",
    service_lines: [],
    requirements: [],
    status: "COMPLETED",
    version: 3,
    scheduled_start: "2026-08-19T09:00:00Z",
    estimated_duration_minutes: 120,
    en_route_at: null,
    arrived_at: null,
    customer_unavailable_wait_started_at: null,
    late_declared_at: null,
    work_tasks: [],
    evidence: [],
    active_amendment: null,
    estimated_earning: {
      gross_paise: 300_000,
      commission_paise: 45_000,
      net_paise: 255_000,
      currency: "INR",
    },
    earning: {
      gross_paise: 700_000,
      commission_paise: 100_000,
      net_paise: 600_000,
      currency: "INR",
      status: "SETTLED",
      calculation_snapshot: null,
    },
    gates: {
      address_unlocks_at: "2026-08-19T07:00:00Z",
      en_route_opens_at: "2026-08-19T08:00:00Z",
      en_route_closes_at: "2026-08-19T11:30:00Z",
      arrival_opens_at: "2026-08-19T08:30:00Z",
      arrival_closes_at: "2026-08-19T11:30:00Z",
    },
    allowed_actions: [],
    site_address: null,
    directions_url: null,
    customer_first_name: null,
    customer_phone: null,
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
  serverNow: null as string | null,
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
      serverNow: NOW,
    });

    expect(items.map((item) => item.kind)).toEqual(["offer", "enquiry", "engagement", "job"]);
  });

  it("ranks by urgency before it looks at any clock", () => {
    // The settled job's instant is earlier than the live offer's deadline. Rank
    // has to win, or a finished job outranks a dispatch that expires in ninety
    // seconds.
    const items = toWorkItems({
      ...EMPTY,
      offers: [offer({ responds_by: "2026-08-19T10:05:00Z" })],
      offersServerNow: NOW,
      jobs: [job({ status: "COMPLETED", scheduled_start: "2026-08-19T02:00:00Z" })],
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

  it("chips the time left off the same server clock the countdown dial reads", () => {
    // `offer()`'s default `responds_by` is two minutes after `NOW`.
    const [item] = toWorkItems({ ...EMPTY, offers: [offer()], offersServerNow: NOW });

    expect(item?.stateLabel).toBe("Offer · 2:00 left");
  });

  it("chips a null deadline as an offer with nothing to count down", () => {
    const [item] = toWorkItems({
      ...EMPTY,
      offers: [offer({ responds_by: null })],
      offersServerNow: NOW,
    });

    expect(item?.stateLabel).toBe("Offer");
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

  it("chips the time left off its own server_now, matching the crew-offer wording", () => {
    // `directOffer()`'s default `expires_at` is three minutes after its
    // `server_now`, and carries no `undo_deadline`.
    const [item] = toWorkItems({ ...EMPTY, directOffers: [directOffer()] });

    expect(item?.stateLabel).toBe("Offer · 3:00 left");
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

  it("drops an INVITED enquiry whose response window has already passed by the server clock", () => {
    // The backend fix this build is the client half of: the list endpoint no
    // longer returns a lapsed invitation, and this closes the same
    // poll-staleness window `isOfferLive` closes for crew offers — a cached
    // page up to a poll interval old still showing an enquiry that expired in
    // the meantime.
    const items = toWorkItems({
      ...EMPTY,
      enquiries: [enquiry({ status: "INVITED", responds_by: "2026-08-19T09:00:00Z" })],
      serverNow: NOW,
    });

    expect(items).toHaveLength(0);
  });

  it("keeps an INVITED enquiry exactly at its deadline as lapsed too", () => {
    const items = toWorkItems({
      ...EMPTY,
      enquiries: [enquiry({ status: "INVITED", responds_by: NOW })],
      serverNow: NOW,
    });

    expect(items).toHaveLength(0);
  });

  it("does not lapse-check an ACCEPTED enquiry, whose clock means something else", () => {
    // `isVendorsMove`'s `accepted` bucket is a capacity hold with its own
    // lifecycle, not a response deadline — `responds_by` on that bucket is not
    // the same clock the INVITED lapse guard exists to close.
    const items = toWorkItems({
      ...EMPTY,
      enquiries: [
        enquiry({ status: "ACCEPTED", responds_by: "2026-08-01T00:00:00Z" }),
      ],
      serverNow: NOW,
    });

    expect(items).toHaveLength(1);
  });

  it("keeps every INVITED enquiry when no calibrated clock has landed yet", () => {
    // No offers read means no server instant to judge against — see
    // `toWorkItems`'s own `serverNow` doc. A phone's own clock must never
    // decide an enquiry is dead, so nothing here is filtered on a guess; the
    // list endpoint's own filtering is the backstop.
    const items = toWorkItems({
      ...EMPTY,
      enquiries: [enquiry({ status: "INVITED", responds_by: "2026-08-01T00:00:00Z" })],
      serverNow: null,
    });

    expect(items).toHaveLength(1);
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

  it("carries no price and only the published approximate area", () => {
    const [item] = toWorkItems({ ...EMPTY, enquiries: [enquiry()] });

    expect(item?.amountPaise).toBeNull();
    expect(item?.areaLabel).toBe("Kukatpally, Hyderabad");
    expect(item?.actionLabel).toBe("Review & book visit");
    expect(item?.href).toBe("/work/enquiries/e1");
  });

  it("chips an INVITED enquiry as waiting for an answer, and an accepted one as needing a price", () => {
    const [invited] = toWorkItems({
      ...EMPTY,
      enquiries: [enquiry({ id: "e1", status: "INVITED" })],
    });
    const [accepted] = toWorkItems({
      ...EMPTY,
      enquiries: [enquiry({ id: "e1", status: "ACCEPTED" })],
    });

    expect(invited?.stateLabel).toBe("Waiting for your answer");
    expect(accepted?.stateLabel).toBe("Needs a price");
  });

  it("chips a booked visit-first slot as Visit booked ahead of the ordinary wording", () => {
    const [item] = toWorkItems({
      ...EMPTY,
      enquiries: [enquiry({ id: "e1", status: "ACCEPTED", fixed_visit_status: "BOOKED" })],
    });

    expect(item?.stateLabel).toBe("Visit booked");
  });
});

describe("toWorkItems — a sent quote", () => {
  /*
    `answered`, not `settled`.

    The two shared one urgency briefly, which put a sent quote behind the green
    "held until payout" treatment and rendered its amount as `₹ ?` — the
    platform announcing it did not know a price, on the one card whose whole
    subject is a price the vendor had just sent. Nothing is held on a sent quote
    and nothing is owed; the customer simply has not answered.
  */
  it("is its own state, between the work in hand and the money banked", () => {
    const quoted = enquiry({ id: "e1", status: "QUOTED", latest_proposal_status: "SUBMITTED" });

    const items = toWorkItems({ ...EMPTY, enquiries: [quoted] });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: "enquiry:e1",
      urgency: "answered",
      respondsBy: null,
      // Not published on `EnquirySummary`, so never drawn as a figure.
      amountPaise: null,
    });
  });

  it("carries a distinct accessible name from a still-open enquiry", () => {
    const quoted = enquiry({
      id: "e1",
      status: "QUOTED",
      service_name: "Deep clean",
      latest_proposal_status: "SUBMITTED",
    });

    const items = toWorkItems({ ...EMPTY, enquiries: [quoted] });

    expect(items[0]?.accessibleName).toBe("Deep clean, Quote sent — waiting on the customer");
    // The title is the work alone — the chip carries the state, so a card can
    // truncate the first without losing the second.
    expect(items[0]?.title).toBe("Deep clean");
    expect(items[0]?.stateLabel).toBe("Quote sent — waiting on the customer");
  });

  it("does not also appear as a needs-price card", () => {
    const quoted = enquiry({ id: "e1", status: "QUOTED", latest_proposal_status: "SUBMITTED" });

    const items = toWorkItems({ ...EMPTY, enquiries: [quoted] });

    expect(items.filter((item) => item.key === "enquiry:e1")).toHaveLength(1);
  });

  it("shows a truthful not-chosen outcome after the customer continues elsewhere", () => {
    const quoted = enquiry({
      id: "e1",
      status: "QUOTED",
      latest_proposal_status: "REJECTED",
      latest_proposal_rejection_reason: "NOT_CHOSEN",
    });

    const items = toWorkItems({ ...EMPTY, enquiries: [quoted] });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      urgency: "not_chosen",
      stateLabel: "Not chosen",
      accessibleName: "Deep clean, Not chosen",
    });
  });

  it("does not duplicate a chosen quote beside its engagement", () => {
    const quoted = enquiry({
      id: "e1",
      status: "QUOTED",
      latest_proposal_status: "ACCEPTED",
    });

    expect(toWorkItems({ ...EMPTY, enquiries: [quoted] })).toEqual([]);
  });

  it("shows Cancelled instead of waiting when the customer closed the request", () => {
    const quoted = enquiry({
      status: "QUOTED",
      requirement_status: "CLOSED_CANCELLED",
      latest_proposal_status: "SUBMITTED",
    });

    expect(toWorkItems({ ...EMPTY, enquiries: [quoted] })[0]).toMatchObject({
      urgency: "closed",
      stateLabel: "Cancelled",
    });
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
    expect(items.map((item) => item.urgency)).toEqual(["doing", "doing", "answered"]);
  });

  it("keeps every terminal and exception status in the correct work bucket", () => {
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

    expect(Object.fromEntries(items.map((item) => [item.key, item.urgency]))).toEqual({
      "engagement:disputed": "doing",
      "engagement:cancelled": "closed",
      "engagement:done": "settled",
      "engagement:warranty": "settled",
      "engagement:closed": "settled",
    });
    expect(Object.fromEntries(items.map((item) => [item.key, item.stateLabel]))).toEqual({
      "engagement:disputed": "In dispute",
      "engagement:cancelled": "Cancelled",
      "engagement:done": "Completed",
      "engagement:warranty": "Warranty period",
      "engagement:closed": "Closed",
    });
    expect(items.find((item) => item.key === "engagement:cancelled")).toMatchObject({
      amountPaise: null,
      amountLabel: null,
    });
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

  it("labels a managed project as the agreed total", () => {
    const [item] = toWorkItems({ ...EMPTY, engagements: [engagement()] });

    expect(item?.amountLabel).toBe("Agreed total");
    expect(item?.amountPaise).toBe(2_160_000);
  });

  it("chips a managed project's status in the vendor's own words", () => {
    const items = toWorkItems({
      ...EMPTY,
      engagements: [
        engagement({ id: "pending", status: "PENDING_START" }),
        engagement({ id: "active", status: "ACTIVE" }),
        engagement({ id: "completing", status: "COMPLETING" }),
      ],
    });

    expect(items.map((item) => item.stateLabel)).toEqual([
      "Confirmed",
      "In progress",
      "Waiting for the customer",
    ]);
  });
});

describe("toWorkItems — A3 day-hire engagements", () => {
  const dayHire = (overrides: Partial<Engagement> = {}) =>
    engagement({
      archetype: "A3_TIME_BLOCK",
      commercial_mode: "LEAD_ONLY",
      crew_terms: CREW_TERMS,
      staged_total_paise: 950_000,
      ...overrides,
    });

  it("shows the lead's own receipt while the days are still being worked", () => {
    // `staged_total_paise` on A3 is the customer's figure, booking fee
    // included. The lead's number is `crew_terms.lead_receipt_paise`.
    const [item] = toWorkItems({ ...EMPTY, engagements: [dayHire({ status: "ACTIVE" })] });

    expect(item?.amountPaise).toBe(900_000);
    expect(item?.amountLabel).toBe("To you, paid daily");
    expect(item?.title).toBe("Full home rewiring");
  });

  it("says what was collected directly after the customer completes the job", () => {
    const [item] = toWorkItems({
      ...EMPTY,
      engagements: [
        dayHire({
          status: "COMPLETED",
          completed_at: NOW,
          stages: [
            shiftDay({ id: "s1", position: 1, summary: { settlement_amount_paise: 320_000 } }),
            shiftDay({ id: "s2", position: 2, summary: { settlement_amount_paise: 300_000 } }),
            shiftDay({ id: "s3", position: 3, summary: { settlement_amount_paise: 300_000 } }),
          ],
        }),
      ],
    });

    expect(item?.amountPaise).toBe(920_000);
    expect(item?.amountLabel).toBe("Collected directly");
    expect(item?.urgency).toBe("settled");
    expect(item?.whenIso).toBe(NOW);
  });

  it("does not print a zero when a closing job has no settled day on it", () => {
    // An older record with no `shift_summary`, or a job closed before any
    // settlement landed. The agreed receipt is the honest figure.
    const [item] = toWorkItems({
      ...EMPTY,
      engagements: [
        dayHire({
          status: "COMPLETING",
          stages: [shiftDay({ shift_summary: null })],
        }),
      ],
    });

    expect(item?.amountPaise).toBe(900_000);
    expect(item?.amountLabel).toBe("To you, paid daily");
  });

  it("falls back to the staged total on a record written before crew terms were published", () => {
    const [item] = toWorkItems({
      ...EMPTY,
      engagements: [dayHire({ crew_terms: null, staged_total_paise: 900_000 })],
    });

    expect(item?.amountPaise).toBe(900_000);
    expect(item?.amountLabel).toBe("To you, paid daily");
  });

  it("chips the day count off settled shift-days rather than a raw ACTIVE label", () => {
    const [item] = toWorkItems({
      ...EMPTY,
      engagements: [
        dayHire({
          status: "ACTIVE",
          stages: [
            shiftDay({ id: "s1", position: 1 }),
            shiftDay({ id: "s2", position: 2, summary: { settlement_status: "SUPERVISOR_CLAIMED" } }),
            shiftDay({ id: "s3", position: 3, summary: { settlement_status: "SUPERVISOR_CLAIMED" } }),
          ],
        }),
      ],
    });

    // One of three settled, so the day in front of the lead is the second.
    expect(item?.stateLabel).toBe("Day 2 of 3");
  });

  it("drops a cancelled day from the count rather than always reading a stale total", () => {
    // Three stages, one cancelled: the total reads 2, not 3, and the cancelled
    // day (unsettled by construction) never inflates the settled count either.
    const [item] = toWorkItems({
      ...EMPTY,
      engagements: [
        dayHire({
          status: "ACTIVE",
          stages: [
            shiftDay({ id: "s1", position: 1 }),
            shiftDay({ id: "s2", position: 2, status: "CANCELLED" }),
            shiftDay({ id: "s3", position: 3, summary: { settlement_status: "SUPERVISOR_CLAIMED" } }),
          ],
        }),
      ],
    });

    expect(item?.stateLabel).toBe("Day 2 of 2");
  });

  it("falls back to In progress when a day-hire record has no stages yet", () => {
    const [item] = toWorkItems({ ...EMPTY, engagements: [dayHire({ status: "ACTIVE", stages: [] })] });

    expect(item?.stateLabel).toBe("In progress");
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

  it("chips every visit status in the one wording the job list and job detail screen already share", () => {
    // `STATUS_COPY` (`features/work/model/status.ts`) is reused rather than
    // reinvented here — a card in this stack disagreeing with the job detail
    // screen about the same status would be a third vocabulary.
    const items = toWorkItems({
      ...EMPTY,
      jobs: [
        job({ id: "confirmed", status: "CONFIRMED" }),
        job({ id: "enroute", status: "EN_ROUTE" }),
        job({ id: "arrived", status: "ARRIVED" }),
        job({ id: "onsite", status: "IN_PROGRESS" }),
        job({ id: "filed", status: "COMPLETION_SUBMITTED" }),
        job({ id: "done", status: "COMPLETED" }),
        job({ id: "part", status: "PARTIALLY_COMPLETED" }),
      ],
    });

    expect(Object.fromEntries(items.map((item) => [item.key, item.stateLabel]))).toEqual({
      "job:confirmed": "Booked",
      "job:enroute": "On the way",
      "job:arrived": "Arrived",
      "job:onsite": "Working",
      "job:filed": "Waiting for customer",
      "job:done": "Done",
      "job:part": "Part done",
    });
  });

  it("sorts the next job soonest-first and finished ones newest-first", () => {
    const items = toWorkItems({
      ...EMPTY,
      jobs: [
        job({ id: "later", status: "CONFIRMED", scheduled_start: "2026-08-25T09:00:00Z" }),
        job({ id: "next", status: "CONFIRMED", scheduled_start: "2026-08-20T09:00:00Z" }),
        job({ id: "old", status: "COMPLETED", scheduled_start: "2026-08-19T00:30:00Z" }),
        job({ id: "recent", status: "PARTIALLY_COMPLETED", scheduled_start: "2026-08-19T08:00:00Z" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual([
      "job:next",
      "job:later",
      "job:recent",
      "job:old",
    ]);
  });

  it("keeps completed job history regardless of age", () => {
    const items = toWorkItems({
      ...EMPTY,
      jobs: [
        // 30h before `server_now` — clearly outside the window.
        job({ id: "old", status: "COMPLETED", scheduled_start: "2026-08-18T04:00:00Z" }),
        // 2h before `server_now` — clearly inside it.
        job({ id: "recent", status: "PARTIALLY_COMPLETED", scheduled_start: "2026-08-19T08:00:00Z" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual(["job:recent", "job:old"]);
  });

  it("keeps a job in progress regardless of how old its scheduled start is", () => {
    const items = toWorkItems({
      ...EMPTY,
      jobs: [
        job({ id: "old-doing", status: "IN_PROGRESS", scheduled_start: "2026-08-18T04:00:00Z" }),
        job({ id: "old-done", status: "COMPLETED", scheduled_start: "2026-08-18T04:00:00Z" }),
      ],
    });

    expect(items.map((item) => item.key)).toEqual(["job:old-doing", "job:old-done"]);
  });

  it("keeps dispute, recovery, and cancellation states visible", () => {
    const items = toWorkItems({
      ...EMPTY,
      jobs: [
        job({ id: "cancelled", status: "CANCELLED" }),
        job({ id: "disputed", status: "DISPUTED" }),
        job({ id: "recovery", status: "RECOVERY_REQUIRED" }),
      ],
    });

    expect(Object.fromEntries(items.map((item) => [item.key, item.urgency]))).toEqual({
      "job:disputed": "doing",
      "job:recovery": "doing",
      "job:cancelled": "closed",
    });
    expect(Object.fromEntries(items.map((item) => [item.key, item.stateLabel]))).toEqual({
      "job:disputed": "Customer raised a problem",
      "job:recovery": "Needs help",
      "job:cancelled": "Cancelled",
    });
    expect(items.find((item) => item.key === "job:cancelled")).toMatchObject({
      amountPaise: null,
      amountLabel: null,
    });
  });

  it("uses the final net earning after settlement and the estimate before it settles", () => {
    const [settled] = toWorkItems({ ...EMPTY, jobs: [job()] });
    const [unsettled] = toWorkItems({
      ...EMPTY,
      jobs: [job({ id: "j2", status: "CONFIRMED", earning: null })],
    });

    expect(settled?.amountPaise).toBe(600_000);
    expect(settled?.amountLabel).toBe("You earned");
    expect(unsettled?.amountPaise).toBe(255_000);
    expect(unsettled?.amountLabel).toBe("Est. payout");
    expect(settled?.href).toBe("/work/jobs/j1");
  });

  it("keeps the durable booked title, area, schedule and duration before tasks exist", () => {
    const [item] = toWorkItems({
      ...EMPTY,
      jobs: [
        job({
          status: "CONFIRMED",
          work_tasks: [],
          earning: null,
          scheduled_start: "2026-08-20T09:00:00Z",
          estimated_duration_minutes: 90,
        }),
      ],
    });

    expect(item).toMatchObject({
      title: "Bathroom deep clean",
      areaLabel: "Madhapur",
      whenIso: "2026-08-20T09:00:00Z",
      whenIsDay: false,
      durationMinutes: 90,
    });
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

/*
  The three defects a real screenshot surfaced, which no assertion here covered.
*/
describe("toWorkItems — what a card can actually say", () => {
  it("titles a booking from its work, not from its status", () => {
    const items = toWorkItems({
      ...EMPTY,
      jobs: [job({ id: "j1", status: "CONFIRMED" })],
    });

    expect(items[0]?.title).not.toMatch(/confirmed/i);
  });

  it("marks an enquiry's requested start as a day, not a moment", () => {
    const items = toWorkItems({ ...EMPTY, enquiries: [enquiry({ id: "e1" })] });

    // Rendering this as a clock printed "12:00 am" on every enquiry card,
    // because the customer picks a date and the server stores midnight.
    expect(items[0]?.whenIsDay).toBe(true);
  });

  it("marks a booking's scheduled start as a real moment", () => {
    const items = toWorkItems({ ...EMPTY, jobs: [job({ id: "j1" })] });

    expect(items[0]?.whenIsDay).toBe(false);
  });

  it("keeps title and accessible name in step", () => {
    const items = toWorkItems({
      ...EMPTY,
      enquiries: [enquiry({ id: "e1", status: "INVITED", service_name: "Rewiring" })],
    });

    const item = items[0]!;
    expect(item.accessibleName).toBe(`${item.title}, ${item.stateLabel}`);
  });
});
