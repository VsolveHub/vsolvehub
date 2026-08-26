import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { WorkItem } from "../model/work-item";
/*
  The cards live in their own module since the redesign split them out of the
  home screen — `work-home.tsx` re-exports `WorkCard` so `all-work.tsx` keeps
  one import path, but a test about the card should name the card's own file.
*/
import { WorkCard } from "./work-card";

describe("WorkCard — a confirmed A1 job", () => {
  it("shows the service, estimated payout, full schedule, duration and area", () => {
    const item: WorkItem = {
      kind: "job",
      key: "job:b1",
      href: "/work/jobs/b1",
      amountPaise: 255_000,
      amountLabel: "Est. payout",
      urgency: "doing",
      respondsBy: null,
      whenIso: "2026-08-20T09:00:00Z",
      whenIsDay: false,
      durationMinutes: 90,
      areaLabel: "Madhapur",
      title: "Bathroom deep clean",
      stateLabel: null,
      accessibleName: "Bathroom deep clean",
    };

    render(<WorkCard item={item} />);

    expect(screen.getByText("Bathroom deep clean")).toBeInTheDocument();
    expect(screen.getByText("Est. payout")).toBeInTheDocument();
    expect(screen.getByText(/2,550/)).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
    expect(screen.getByText("Starts")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("1 hr 30 min")).toBeInTheDocument();
    expect(screen.getByText("Area")).toBeInTheDocument();
    expect(screen.getByText("Madhapur")).toBeInTheDocument();
  });
});

describe("WorkCard — a project enquiry", () => {
  it("shows locality and requested day without a fake or missing price", () => {
    const item: WorkItem = {
      kind: "enquiry",
      key: "enquiry:e1",
      href: "/work/enquiries/e1",
      amountPaise: null,
      amountLabel: null,
      urgency: "needs_price",
      respondsBy: "2026-08-21T10:00:00Z",
      whenIso: "2026-08-24T00:00:00Z",
      whenIsDay: true,
      durationMinutes: null,
      areaLabel: "Kukatpally, Hyderabad",
      actionLabel: "Review & book visit",
      title: "Interior fit-out project",
      stateLabel: "waiting on your answer",
      accessibleName: "Interior fit-out project, waiting on your answer",
    };

    render(<WorkCard item={item} />);

    expect(screen.getByText("Interior fit-out project")).toBeInTheDocument();
    expect(screen.getByText("Near")).toBeInTheDocument();
    expect(screen.getByText("Kukatpally, Hyderabad")).toBeInTheDocument();
    expect(screen.getByText("Review & book visit")).toBeInTheDocument();
    expect(screen.queryByText("₹ ?")).not.toBeInTheDocument();
    expect(screen.queryByText(/no price/i)).not.toBeInTheDocument();
  });
});
