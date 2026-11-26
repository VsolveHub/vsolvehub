import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { withI18n } from "@/i18n/test-utils";

import type { LedgerEntry } from "../queries";
import { EntryOrigin, originHref } from "./earnings-panel";

const NONE = {
  title: "",
  stage_position: null,
  stage_label: "",
  starts_on: null,
  ends_on: null,
  booking_id: null,
  rental_booking_id: null,
  engagement_id: null,
};

function entry(
  origin: Partial<LedgerEntry["origin"]> & { type: LedgerEntry["origin"]["type"] },
  kind: LedgerEntry["kind"] = "EARNING",
): LedgerEntry {
  return { id: "e1", kind, origin: { ...NONE, ...origin } } as LedgerEntry;
}

describe("EntryOrigin", () => {
  it("names a home-service visit and links to its job", () => {
    render(
      withI18n(
        <EntryOrigin
          entry={entry({
            type: "HOME_VISIT",
            title: "AC Service",
            starts_on: "2026-11-12",
            booking_id: "b-1",
          })}
        />,
      ),
    );

    const link = screen.getByRole("link", { name: "Open AC Service" });
    expect(link).toHaveAttribute("href", "/work/jobs/b-1");
    expect(screen.getByText(/Home service visit · /)).toBeInTheDocument();
  });

  it("gives a rental its item and both days, and opens the booking", () => {
    render(
      withI18n(
        <EntryOrigin
          entry={entry({
            type: "RENTAL",
            title: "Canon camera",
            starts_on: "2026-11-22",
            ends_on: "2026-11-24",
            rental_booking_id: "r-1",
          })}
        />,
      ),
    );

    expect(screen.getByRole("link", { name: "Open Canon camera" })).toHaveAttribute(
      "href",
      "/rentals/bookings?booking=r-1",
    );
    expect(screen.getByText(/Rental · .* – /)).toBeInTheDocument();
  });

  it("names a project stage by its number and the partner's label", () => {
    render(
      withI18n(
        <EntryOrigin
          entry={entry({
            type: "PROJECT_STAGE",
            title: "Painting",
            stage_position: 2,
            stage_label: "Walls",
            engagement_id: "g-1",
          })}
        />,
      ),
    );

    expect(screen.getByRole("link", { name: "Open Painting" })).toHaveAttribute(
      "href",
      "/work/jobs/g-1",
    );
    expect(screen.getByText(/Stage 2: Walls/)).toBeInTheDocument();
  });

  it("says a refund was taken back", () => {
    render(
      withI18n(
        <EntryOrigin
          entry={entry({ type: "HOME_VISIT", title: "AC Service", booking_id: "b-1" }, "REVERSAL")}
        />,
      ),
    );

    expect(screen.getByText(/Refund taken back/)).toBeInTheDocument();
  });

  it("shows a correction with nothing to open as plain text", () => {
    render(withI18n(<EntryOrigin entry={entry({ type: "ADJUSTMENT" })} />));

    expect(screen.getByText("Correction by Vsolve")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("originHref", () => {
  it("opens nothing for a withdrawal fee", () => {
    expect(originHref({ ...NONE, type: "WITHDRAWAL_FEE" })).toBeNull();
  });
});
