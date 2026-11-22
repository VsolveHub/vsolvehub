import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EmployerMark,
  VerifiedBadge,
  employerDetailLine,
  employerName,
  listingEmployer,
  type EmployerIdentity,
} from "./employer-identity";

/**
 * How a job card says who is hiring. A business is shown by name, logo, industry and size; an
 * individual by a short name and area only; "Verified" only when the server says so.
 */

function identity(overrides: Partial<EmployerIdentity> = {}): EmployerIdentity {
  return {
    name: "Sai Mobiles",
    kind: "BUSINESS",
    locality: "Kondapur, Hyderabad",
    is_verified: true,
    logo_url: "",
    industry_label: "Shop / retail",
    size_label: "11-50",
    ...overrides,
  };
}

describe("the employer's mark", () => {
  it("is the logo when there is one", () => {
    render(<EmployerMark employer={identity({ logo_url: "https://media.example/logo.png" })} />);

    expect(document.querySelector("img")).toHaveAttribute("src", "https://media.example/logo.png");
  });

  it("is the first letter of the name in its place", () => {
    render(<EmployerMark employer={identity({ name: "sai Mobiles" })} />);

    expect(screen.getByText("S")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("the verified badge", () => {
  it("says a business is a verified business", () => {
    render(<VerifiedBadge employer={identity()} />);

    expect(screen.getByText("Verified business")).toBeInTheDocument();
  });

  it("says an individual is a verified individual", () => {
    render(<VerifiedBadge employer={identity({ kind: "INDIVIDUAL", name: "Priya S." })} />);

    expect(screen.getByText("Verified individual")).toBeInTheDocument();
  });

  it("says nothing when the server does not say they are verified", () => {
    const { container } = render(<VerifiedBadge employer={identity({ is_verified: false })} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to a plain 'Verified employer' for an employer with no kind", () => {
    render(<VerifiedBadge employer={identity({ kind: "" as EmployerIdentity["kind"] })} />);

    expect(screen.getByText("Verified employer")).toBeInTheDocument();
  });
});

describe("the detail line", () => {
  it("is industry, size and area for a business", () => {
    expect(employerDetailLine(identity())).toBe("Shop / retail · 11-50 · Kondapur, Hyderabad");
  });

  it("is only the area for an individual", () => {
    expect(
      employerDetailLine(identity({ kind: "INDIVIDUAL", industry_label: "", size_label: "" })),
    ).toBe("Kondapur, Hyderabad");
  });

  it("leaves out whatever is missing, and is empty when everything is", () => {
    expect(employerDetailLine(identity({ locality: "" }))).toBe("Shop / retail · 11-50");
    expect(employerDetailLine(identity({ locality: "", industry_label: "", size_label: "" }))).toBe("");
  });
});

describe("the employer for a listing", () => {
  it("is what the server sent", () => {
    const sent = identity({ name: "Priya S.", kind: "INDIVIDUAL" });

    expect(listingEmployer({ employer: sent, poster_name: "ignored" })).toBe(sent);
  });

  it("is the public name alone, unverified, when no identity was sent", () => {
    const fallback = listingEmployer({ poster_name: "Sai Mobiles" });

    expect(fallback.name).toBe("Sai Mobiles");
    expect(fallback.is_verified).toBe(false);
    expect(fallback.logo_url).toBe("");
  });

  it("never invents a name: a missing one is a plain 'Employer'", () => {
    expect(employerName(listingEmployer({}))).toBe("Employer");
    expect(employerName(listingEmployer({ poster_name: "   " }))).toBe("Employer");
  });
});
