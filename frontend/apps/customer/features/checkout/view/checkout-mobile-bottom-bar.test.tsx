import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { groupQuote, money } from "../fixtures";
import { CheckoutMobileBottomBar } from "./checkout-mobile-bottom-bar";

const MOCK_QUOTE = groupQuote({
  total: money(82700),
});

describe("CheckoutMobileBottomBar", () => {
  it("renders amount and breakup without confirm button when showConfirmButton is false", () => {
    render(<CheckoutMobileBottomBar quote={MOCK_QUOTE} showConfirmButton={false} />);

    expect(screen.getByText("Amount to pay")).toBeInTheDocument();
    expect(screen.getByText("View breakup")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm booking/i })).not.toBeInTheDocument();
  });

  it("renders confirm button alongside price when showConfirmButton is true", () => {
    const onConfirm = vi.fn();
    render(
      <CheckoutMobileBottomBar
        quote={MOCK_QUOTE}
        showConfirmButton={true}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("To pay:")).toBeInTheDocument();
    expect(screen.getByText("View breakup")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /confirm booking/i });
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables confirm button when isConfirmDisabled is true", () => {
    render(
      <CheckoutMobileBottomBar
        quote={MOCK_QUOTE}
        showConfirmButton={true}
        isConfirmDisabled={true}
      />,
    );

    expect(screen.getByRole("button", { name: /confirm booking/i })).toBeDisabled();
  });
});
