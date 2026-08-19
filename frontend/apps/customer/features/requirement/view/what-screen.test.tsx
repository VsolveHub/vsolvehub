import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RequirementQuestionView } from "../adapters";
import { RequirementProvider } from "./requirement-context";
import { WhatScreen } from "./what-screen";

const FIT_OUT_QUESTION: RequirementQuestionView = {
  code: "fit_out_style",
  label: "What kind of fit-out do you need?",
  help: "Pick the closest match. We fill in the rest from the option you choose.",
  kind: "choice",
  required: true,
  options: [
    {
      value: "office-fit-out",
      label: "Office fit-out",
      description: "Open desks, meeting rooms, power and data, with a tidy move-in finish.",
    },
    {
      value: "retail-fit-out",
      label: "Retail fit-out",
      description: "Shopfronts, display walls, lighting and customer flow.",
    },
    {
      value: "hospitality-fit-out",
      label: "Hospitality fit-out",
      description: "Counters, seating zones and durable guest-facing finishes.",
    },
    {
      value: "shell-core-completion",
      label: "Shell and core completion",
      description: "Partitions, ceilings, flooring and services brought together for a bare shell.",
    },
  ],
};

function renderScreen(onChoiceSelect = vi.fn()) {
  return render(
    <RequirementProvider categorySlug="interior-fit-out-project">
      <WhatScreen
        categoryName="Interior fit-out project"
        questions={[FIT_OUT_QUESTION]}
        onChoiceSelect={onChoiceSelect}
      />
    </RequirementProvider>,
  );
}

describe("WhatScreen choice cards", () => {
  it("renders the mock data for each option", () => {
    renderScreen();

    expect(screen.getByText("Office fit-out")).toBeInTheDocument();
    expect(screen.getByText("18 desks")).toBeInTheDocument();
    expect(screen.getAllByText("Included").length).toBeGreaterThan(0);
    expect(screen.getByText("Electrical and data points")).toBeInTheDocument();
    expect(screen.getByText("Retail fit-out")).toBeInTheDocument();
    expect(screen.getByText("Display wall")).toBeInTheDocument();
    expect(screen.getAllByText("Not included").length).toBeGreaterThan(0);
    expect(screen.getByText("POS machines")).toBeInTheDocument();
    expect(screen.getByText("Shell and core completion")).toBeInTheDocument();
  });

  it("stores the selected option when a card is chosen", () => {
    const onChoiceSelect = vi.fn();
    renderScreen(onChoiceSelect);

    fireEvent.click(screen.getByRole("radio", { name: /retail fit-out/i }));

    expect(screen.getByRole("radio", { name: /retail fit-out/i })).toBeChecked();
    expect(onChoiceSelect).toHaveBeenCalledWith("fit_out_style", "retail-fit-out");
  });
});
