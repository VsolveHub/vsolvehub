// Ported from frontend/apps/customer/features/listings/view/employer-identity.test.tsx
import { render } from "@testing-library/react-native";

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
  it("is the first letter of the name when there is no logo", async () => {
    const view = await render(<EmployerMark employer={identity({ name: "sai Mobiles" })} />);

    expect(view.getByText("S")).toBeTruthy();
  });
});

describe("the verified badge", () => {
  it("says a business is a verified business", async () => {
    const view = await render(<VerifiedBadge employer={identity()} />);

    expect(view.getByText("Verified business")).toBeTruthy();
  });

  it("says an individual is a verified individual", async () => {
    const view = await render(<VerifiedBadge employer={identity({ kind: "INDIVIDUAL", name: "Priya S." })} />);

    expect(view.getByText("Verified individual")).toBeTruthy();
  });

  it("says nothing when the server does not say they are verified", async () => {
    const view = await render(<VerifiedBadge employer={identity({ is_verified: false })} />);

    expect(view.queryByText(/Verified/)).toBeNull();
  });

  it("falls back to a plain 'Verified employer' for an employer with no kind", async () => {
    const view = await render(<VerifiedBadge employer={identity({ kind: "" as EmployerIdentity["kind"] })} />);

    expect(view.getByText("Verified employer")).toBeTruthy();
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
