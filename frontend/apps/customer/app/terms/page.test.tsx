import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/terms",
  useSearchParams: () => new URLSearchParams(),
}));

const { default: TermsPage } = await import("./page");

/** The nine items the server lists in `RIDES_PARCEL_PROHIBITED_ITEMS` (D23), as the page words them. */
const PROHIBITED = [
  "weapons and ammunition",
  "fireworks and explosives",
  "gas cylinders, fuel and other flammable or hazardous chemicals",
  "drugs and narcotics",
  "alcohol",
  "cash, currency, cheques and securities",
  "gold, silver, jewellery and precious stones",
  "live animals",
  "anything illegal",
];

function section() {
  render(<TermsPage />);
  const heading = screen.getAllByRole("heading", { name: "Pick up & Drop" })[0]!;
  const container = heading.closest("section") ?? heading.parentElement!;
  return within(container as HTMLElement);
}

describe("the Pick up & Drop section of the terms (D22, D23)", () => {
  it("is on the page", () => {
    render(<TermsPage />);

    expect(screen.getAllByRole("heading", { name: "Pick up & Drop" }).length).toBeGreaterThan(0);
  });

  it("says items are not insured and gives the ₹5,000 value cap", () => {
    const terms = section();

    expect(terms.getByText(/Items are not insured/)).toBeInTheDocument();
    expect(terms.getByText(/₹5,000/)).toBeInTheDocument();
  });

  it("states the package guidelines and that confirming is agreeing", () => {
    const terms = section();

    expect(terms.getByText(/securely sealed and ready for pickup/)).toBeInTheDocument();
    expect(terms.getByText(/By confirming, you agree your package follows these guidelines/)).toBeInTheDocument();
  });

  it("lists every prohibited item the server lists, and no other", () => {
    const terms = section();

    for (const item of PROHIBITED) expect(terms.getByText(new RegExp(item, "i"))).toBeInTheDocument();
  });

  it("says a captain may refuse an item, with no charge and no other captain", () => {
    const terms = section();

    expect(terms.getByText(/captain may refuse an item/i)).toBeInTheDocument();
    expect(terms.getByText(/you are not charged, and the package is not offered to another captain/)).toBeInTheDocument();
  });

  it("says who pays where, and that an unpaid receiver does not get the package", () => {
    const terms = section();

    expect(terms.getByText(/choose whether the sender or the receiver pays/)).toBeInTheDocument();
    expect(terms.getByText(/sender pays the captain at the pickup/)).toBeInTheDocument();
    expect(terms.getByText(/receiver pays the captain at/)).toBeInTheDocument();
    expect(terms.getByText(/not handed to a receiver who has not paid/)).toBeInTheDocument();
  });

  it("says any return trip is paid by the sender at the pickup", () => {
    const terms = section();

    expect(terms.getByText(/return trip is charged/)).toBeInTheDocument();
    expect(terms.getByText(/paid by the sender to the captain at the pickup/)).toBeInTheDocument();
  });
});
