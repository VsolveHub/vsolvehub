import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutate = vi.fn();

vi.mock("../queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../queries")>();
  return { ...actual, useLedgerAdjustment: vi.fn() };
});
vi.mock("@/features/partners/view/partner-activity", () => ({ usePartnerActivity: vi.fn() }));
vi.mock("@/features/partners/queries", () => ({ usePartnerDirectory: vi.fn() }));

import { usePartnerDirectory } from "@/features/partners/queries";
import { usePartnerActivity } from "@/features/partners/view/partner-activity";

import { useLedgerAdjustment } from "../queries";
import {
  LedgerAdjustment,
  SUGGESTED_REASONS,
  amountPaise,
  correctionPaise,
} from "./ledger-adjustment";

describe("correction amounts", () => {
  it("reads unsigned rupees, with or without a symbol or commas", () => {
    expect(amountPaise("500")).toBe(50000);
    expect(amountPaise("₹1,250.50")).toBe(125050);
  });

  it("refuses zero, negatives and malformed amounts", () => {
    expect(amountPaise("0")).toBeNull();
    expect(amountPaise("-5")).toBeNull();
    expect(amountPaise("abc")).toBeNull();
  });

  it("signs the amount by the chosen direction", () => {
    expect(correctionPaise("add", "500")).toBe(50000);
    expect(correctionPaise("recover", "500")).toBe(-50000);
    expect(correctionPaise("recover", "")).toBeNull();
  });
});

describe("LedgerAdjustment", () => {
  beforeEach(() => {
    mutate.mockReset();
    vi.mocked(useLedgerAdjustment).mockReturnValue({
      mutate,
      reset: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    } as never);
    vi.mocked(usePartnerDirectory).mockReturnValue({
      data: {
        pages: [
          {
            results: [
              { id: "p-1", display_name: "Ravi Kumar", phone_number: "+919800000001", skills: [] },
            ],
            next: null,
            previous: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(usePartnerActivity).mockReturnValue({
      isPending: false,
      isError: false,
      data: { balance: { available_paise: 100000 } },
    } as never);
  });

  function pickRavi() {
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.mouseDown(screen.getByRole("option", { name: /Ravi Kumar/ }));
  }

  it("says what is still needed before it can be reviewed", () => {
    render(<LedgerAdjustment onStepUpRequired={vi.fn()} />);

    expect(screen.getByText("Still needed: a partner, an amount, a reason.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review/ })).toBeDisabled();
  });

  it("builds a correction from a pick, a quick amount and a suggested reason", () => {
    render(<LedgerAdjustment onStepUpRequired={vi.fn()} />);

    pickRavi();
    fireEvent.click(screen.getByRole("button", { name: "₹500" }));
    fireEvent.click(screen.getByRole("button", { name: SUGGESTED_REASONS.add[0] }));

    expect(screen.getByRole("textbox", { name: /Reason/ })).toHaveValue(SUGGESTED_REASONS.add[0]);
    // The balance before and after is shown while the form is filled, not only in the review.
    expect(screen.getByText("Available after")).toBeInTheDocument();
    const review = screen.getByRole("button", { name: /Review: add ₹500/ });
    expect(review).toBeEnabled();
  });

  it("takes money back without typing a minus sign", () => {
    render(<LedgerAdjustment onStepUpRequired={vi.fn()} />);

    pickRavi();
    fireEvent.click(screen.getByRole("radio", { name: /Take back/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Amount/ }), { target: { value: "-200" } });
    fireEvent.click(screen.getByRole("button", { name: SUGGESTED_REASONS.recover[0] }));
    fireEvent.click(screen.getByRole("button", { name: /Review: take back ₹200/ }));
    fireEvent.click(screen.getByRole("button", { name: /Recover ₹200/ }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        partner_id: "p-1",
        net_paise: -20000,
        reason: SUGGESTED_REASONS.recover[0],
      }),
      expect.anything(),
    );
  });

  it("offers reasons that fit the direction chosen", () => {
    render(<LedgerAdjustment onStepUpRequired={vi.fn()} />);

    expect(screen.getByRole("button", { name: SUGGESTED_REASONS.add[0] })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Take back/ }));

    expect(screen.queryByRole("button", { name: SUGGESTED_REASONS.add[0] })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: SUGGESTED_REASONS.recover[0] })).toBeInTheDocument();
  });
});
