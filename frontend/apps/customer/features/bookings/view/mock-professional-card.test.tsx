import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MockProfessionalCard } from "./mock-professional-card";

const professional = {
  display_name: "Ravi K.",
  headline: "AC technician",
  experience_years: 6,
};

describe("MockProfessionalCard", () => {
  it("shows the backend's headline and experience, never invented stats", () => {
    render(<MockProfessionalCard professional={professional} />);

    expect(screen.getByText("AC technician · 6 yrs experience")).toBeInTheDocument();
    expect(screen.queryByText(/500\+ jobs/)).not.toBeInTheDocument();
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });

  it("keeps the name hidden before payment", () => {
    render(<MockProfessionalCard professional={professional} />);

    expect(screen.queryByText(/Ravi/)).not.toBeInTheDocument();
  });

  it("says a professional is being found when none is assigned yet", () => {
    render(<MockProfessionalCard professional={null} />);

    expect(screen.getByText("Finding your professional")).toBeInTheDocument();
    expect(screen.queryByText(/experience/)).not.toBeInTheDocument();
  });
});
