import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bookingGroup, fulfilmentUnit } from "@/features/checkout/fixtures";

import { AssignmentProgress } from "./assignment-progress";

/**
 * The wait between Confirm and Pay.
 *
 * The two properties defended here are the ones a plausible-looking refactor
 * would break: the payment control is gated on the server's `recovery_action`
 * and never on a status that merely looks like it implies payment, and progress
 * is never phrased as partial success under `ALL_OR_NOTHING`.
 */

describe("while professionals are being found", () => {
  it("says what the platform is doing", () => {
    render(<AssignmentProgress group={bookingGroup({ status: "MATCHING" })} />);

    expect(screen.getByText(/offering your visits to professionals/i)).toBeInTheDocument();
  });

  it("states the all-or-nothing rule beside the count", () => {
    render(
      <AssignmentProgress
        group={bookingGroup({
          status: "PARTIALLY_HELD",
          units: [
            fulfilmentUnit({ id: "u-1", position: 1, status: "HELD" }),
            fulfilmentUnit({ id: "u-2", position: 2, status: "MATCHING" }),
          ],
        })}
      />,
    );

    expect(screen.getByText(/1 of 2 visits have a professional held/i)).toBeInTheDocument();
    expect(screen.getByText(/booked together or not at all/i)).toBeInTheDocument();
  });

  it("never offers to pay before the server asks for payment", () => {
    render(<AssignmentProgress group={bookingGroup({ status: "MATCHING" })} />);

    expect(screen.queryByRole("link", { name: /pay/i })).not.toBeInTheDocument();
  });
});

describe("when the server asks for payment", () => {
  it("offers the control the server named", () => {
    render(
      <AssignmentProgress
        group={bookingGroup({
          status: "PAYMENT_PENDING",
          recovery_action: "PAYMENT_REQUIRED",
          checkout_id: "checkout-1",
          id: "group-1",
        })}
      />,
    );

    expect(screen.getByRole("link", { name: /pay now/i })).toHaveAttribute(
      "href",
      "/bookings/group-1/pay",
    );
  });

  it("withholds the control when there is no checkout to pay against", () => {
    render(
      <AssignmentProgress
        group={bookingGroup({
          status: "PAYMENT_PENDING",
          recovery_action: "PAYMENT_REQUIRED",
          checkout_id: null,
        })}
      />,
    );

    expect(screen.queryByRole("link", { name: /pay now/i })).not.toBeInTheDocument();
  });

  it("does not infer payment from the status alone", () => {
    // `PAYMENT_PENDING` without the server's instruction is exactly the case a
    // status-derived control would get wrong.
    render(
      <AssignmentProgress
        group={bookingGroup({
          status: "PAYMENT_PENDING",
          recovery_action: "NONE",
          checkout_id: "checkout-1",
        })}
      />,
    );

    expect(screen.queryByRole("link", { name: /pay now/i })).not.toBeInTheDocument();
  });
});

describe("when the booking has to be replanned", () => {
  it("sends the customer back to the cart", () => {
    render(
      <AssignmentProgress
        group={bookingGroup({ status: "REPLAN_REQUIRED", recovery_action: "REPLAN" })}
      />,
    );

    expect(screen.getByRole("link", { name: /choose a new arrangement/i })).toHaveAttribute(
      "href",
      "/cart",
    );
  });
});
