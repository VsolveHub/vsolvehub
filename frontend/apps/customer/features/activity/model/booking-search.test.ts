import { describe, expect, it } from "vitest";

import { group, unit, unitLine } from "@/features/bookings/fixtures";
import type { EngagementRowView } from "@/features/engagement/adapters";
import type { RequestRowView } from "@/features/requirement/adapters";

import {
  filterBookingsBySearch,
  matchesBookingSearch,
  searchableBookingMatches,
} from "./booking-search";

function requestRow(overrides: Partial<RequestRowView> = {}): RequestRowView {
  return {
    id: "req-dog-1",
    title: "Dog Grooming",
    status: "MATCHING",
    deadlineAt: null,
    serviceBy: null,
    teaserCount: 0,
    closure: null,
    lastActivityAt: null,
    lifecycleExplanation: "You are hiring people for a period of time.",
    categorySlug: "pet-grooming",
    ...overrides,
  };
}

function engagementRow(overrides: Partial<EngagementRowView> = {}): EngagementRowView {
  return {
    engagementId: "eng-1",
    requirementId: "req-1",
    serviceName: "Event Catering",
    serviceSlug: "event-catering",
    mode: "lead_only",
    status: "ACTIVE",
    activeStageLabel: null,
    activeStageOn: null,
    progress: { done: 0, total: 1 },
    stagedTotalLabel: "₹1,000",
    stagedTotalPaise: 100000,
    fundedTotalLabel: "₹0",
    nextAction: "none",
    actionStageId: null,
    actionStageKind: null,
    isDisputed: false,
    createdAt: null,
    ...overrides,
  };
}

describe("matchesBookingSearch", () => {
  it("is case-insensitive and trims surrounding space", () => {
    expect(matchesBookingSearch("OS Installation", "  os installation  ")).toBe(true);
  });

  it("matches a partial word inside the service name", () => {
    expect(matchesBookingSearch("Dog Grooming", "Grooming")).toBe(true);
    expect(matchesBookingSearch("1 visit Fan installation", "Fan")).toBe(true);
  });

  it("matches query tokens even when they appear in a different order", () => {
    expect(matchesBookingSearch("Gas Stove Repair", "stove gas")).toBe(true);
  });

  it("does not invent a match", () => {
    expect(matchesBookingSearch("Gas Stove Repair", "plumbing")).toBe(false);
  });

  it("treats a blank query as matching everything", () => {
    expect(matchesBookingSearch("anything", "   ")).toBe(true);
  });
});

describe("searchableBookingMatches", () => {
  const fanGroup = {
    kind: "group" as const,
    group: group({
      id: "group-fan-9f3a",
      units: [
        unit({
          lines: [unitLine({ code: "task.fan-installation", label: "Fan installation" })],
        }),
      ],
    }),
  };

  it("finds a booking group by service name", () => {
    expect(searchableBookingMatches(fanGroup, "Fan Installation")).toBe(true);
    expect(searchableBookingMatches(fanGroup, "installation")).toBe(true);
  });

  it("finds a booking group by id", () => {
    expect(searchableBookingMatches(fanGroup, "group-fan-9f3a")).toBe(true);
    expect(searchableBookingMatches(fanGroup, "fan-9f3a")).toBe(true);
  });

  it("finds a request by its service title", () => {
    expect(
      searchableBookingMatches({ kind: "request", row: requestRow() }, "Dog Grooming"),
    ).toBe(true);
    expect(searchableBookingMatches({ kind: "request", row: requestRow() }, "grooming")).toBe(
      true,
    );
  });

  it("finds an engagement from its catalogue slug as words", () => {
    expect(
      searchableBookingMatches({ kind: "engagement", row: engagementRow() }, "event catering"),
    ).toBe(true);
  });
});

describe("filterBookingsBySearch", () => {
  const items = [
    {
      kind: "group" as const,
      group: group({
        id: "keep-1",
        units: [unit({ lines: [unitLine({ label: "OS Installation" })] })],
      }),
    },
    {
      kind: "group" as const,
      group: group({
        id: "drop-1",
        units: [unit({ lines: [unitLine({ id: "ul-2", label: "Gas Stove Repair" })] })],
      }),
    },
    {
      kind: "request" as const,
      row: requestRow({ id: "keep-2", title: "OS Installation" }),
    },
  ];

  it("keeps original order and drops non-matches", () => {
    const visible = filterBookingsBySearch(items, "os");
    expect(visible.map((item) => ("group" in item && item.kind === "group" ? item.group.id : item.row.id))).toEqual([
      "keep-1",
      "keep-2",
    ]);
  });

  it("restores every row when the query is cleared", () => {
    expect(filterBookingsBySearch(items, "os")).toHaveLength(2);
    expect(filterBookingsBySearch(items, "")).toHaveLength(3);
  });
});
