import { render, screen } from "@testing-library/react";
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
  });
});
