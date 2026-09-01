import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BookingSupport } from "./booking-support";

describe("booking support", () => {
  it("keeps every support channel tied to the booking reference", () => {
    render(<BookingSupport reference="booking-503" />);

    expect(screen.getByText("Need help with this booking?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp/i })).toHaveAttribute(
      "href",
      expect.stringContaining("booking-503"),
    );
    expect(screen.getByRole("link", { name: /Call/i })).toHaveAttribute(
      "href",
      "tel:+917330764634",
    );
    expect(screen.getByRole("link", { name: /Email/i })).toHaveAttribute(
      "href",
      expect.stringContaining("booking-503"),
    );
    expect(screen.queryByText("Can I reschedule this visit?")).not.toBeInTheDocument();
  });

  it("lists booking questions only on the faq variant", () => {
    render(<BookingSupport reference="booking-503" variant="faq" />);

    expect(screen.getByText("Can I reschedule this visit?")).toBeInTheDocument();
    expect(screen.getByText("How does cancellation & refund work?")).toBeInTheDocument();
    expect(screen.getByText("How do I get my invoice?")).toBeInTheDocument();
    expect(screen.getByText("Where can I see my professional details?")).toBeInTheDocument();
    expect(screen.getByText("How do I contact support?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp/i })).toHaveAttribute(
      "href",
      expect.stringContaining("booking-503"),
    );
  });

  it("expands and collapses a faq row", () => {
    render(<BookingSupport reference="booking-503" variant="faq" />);

    const question = screen.getByText("How do I get my invoice?");
    const row = question.closest("details");
    expect(row).not.toHaveAttribute("open");

    fireEvent.click(question);
    expect(row).toHaveAttribute("open");

    fireEvent.click(question);
    expect(row).not.toHaveAttribute("open");
  });
});
