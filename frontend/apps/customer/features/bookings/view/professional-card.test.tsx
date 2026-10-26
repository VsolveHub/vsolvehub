import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfessionalCard } from "./professional-card";

describe("ProfessionalCard", () => {
  it("shows who is coming, from the backend's fields only", () => {
    render(
      <ProfessionalCard
        professional={{ display_name: "Ravi Kumar", headline: "AC technician", experience_years: 6 }}
      />,
    );

    expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();
    expect(screen.getByText("AC technician")).toBeInTheDocument();
    expect(screen.getByText("6 years of experience")).toBeInTheDocument();
    expect(screen.getByText("ID verified")).toBeInTheDocument();
    expect(screen.getByText("Approved for this work")).toBeInTheDocument();
  });

  it("claims no rating or job count", () => {
    render(
      <ProfessionalCard professional={{ display_name: "Ravi", headline: "", experience_years: 0 }} />,
    );

    expect(screen.queryByText(/★|rating|jobs/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/experience/)).not.toBeInTheDocument();
  });
});
