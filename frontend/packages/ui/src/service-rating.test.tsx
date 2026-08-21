import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ServiceRatingDialog, ServiceRatingList } from "./service-rating";

describe("ServiceRatingDialog", () => {
  it("requires a star choice and submits the selected score", () => {
    const submit = vi.fn();
    render(
      <ServiceRatingDialog
        open
        counterpartyLabel="Maya"
        isSubmitting={false}
        onOpenChange={() => undefined}
        onSubmit={submit}
      />,
    );

    expect(screen.getByRole("button", { name: "Submit rating" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "5 stars" }));
    fireEvent.change(screen.getByLabelText(/Add a short note/i), {
      target: { value: "Great work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit rating" }));

    expect(submit).toHaveBeenCalledWith(5, "Great work");
  });
});

describe("ServiceRatingList", () => {
  it("lists ratings without calculating a marketplace score", () => {
    render(
      <ServiceRatingList
        ratings={[
          {
            id: "rating-1",
            rater_role: "CUSTOMER",
            score: 4,
            comment: "Careful work",
            created_at: "2026-08-22T09:00:00Z",
            is_mine: false,
          },
        ]}
      />,
    );

    expect(screen.getByText("Customer rating")).toBeInTheDocument();
    expect(screen.getByLabelText("4 out of 5 stars")).toBeInTheDocument();
    expect(screen.getByText("Careful work")).toBeInTheDocument();
  });
});
