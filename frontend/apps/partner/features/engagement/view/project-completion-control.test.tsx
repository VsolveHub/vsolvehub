import { render, screen } from "@testing-library/react";
import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it, vi } from "vitest";

import { withI18n } from "@/i18n/test-utils";

import { ProjectCompletionControl } from "./project-completion-control";

vi.mock("../queries", () => ({
  useCompleteProjectWithCode: () => ({
    isPending: false,
    isError: false,
    error: null,
    mutate: vi.fn(),
  }),
}));

function engagement(status = "ACTIVE", fundingState = "FUNDED") {
  return {
    id: "engagement-1",
    status,
    stages: [{ id: "stage-1", status: "IN_PROGRESS", funding_state: fundingState }],
  } as unknown as Schemas["Engagement"];
}

describe("project completion control", () => {
  it("offers one clear end-project action when all stages are funded", () => {
    render(withI18n(<ProjectCompletionControl engagement={engagement()} />));

    expect(screen.getByRole("button", { name: "End project" })).toBeInTheDocument();
    expect(screen.queryByText(/upload evidence/i)).not.toBeInTheDocument();
  });

  it("does not offer completion while a stage is unfunded", () => {
    render(withI18n(<ProjectCompletionControl engagement={engagement("ACTIVE", "REQUIRED")} />));

    expect(screen.queryByRole("button", { name: "End project" })).not.toBeInTheDocument();
  });
});
