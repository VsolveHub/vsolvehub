import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuestionInbox } from "./question-inbox";

// Mock the queries
vi.mock("../queries", () => ({
  useRequirementQuestions: () => ({
    data: {
      questions: [
        {
          id: "q-1",
          question: "Can we park near the venue?",
          asked_by_role: "VENDOR",
          asked_at: "2026-08-30T10:00:00Z",
          answer: "Yes, front driveway is open.",
          answered_at: "2026-08-30T10:10:00Z",
        },
      ],
    },
  }),
  useAnswerQuestion: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

describe("Customer QuestionInbox", () => {
  it("renders floating chat trigger and opens full-page messaging dialog", () => {
    render(<QuestionInbox requirementId="req-123" />);

    // FAB button is present on the screen
    const fabButton = screen.getByRole("button", { name: /open chat with professional/i });
    expect(fabButton).toBeInTheDocument();

    // Open chat
    fireEvent.click(fabButton);

    // Chat modal is opened
    expect(screen.getByRole("dialog", { name: /chat with professional/i })).toBeInTheDocument();
    expect(screen.getByText("Can we park near the venue?")).toBeInTheDocument();
    expect(screen.getByText("Yes, front driveway is open.")).toBeInTheDocument();

    // Close chat
    const closeButton = screen.getByRole("button", { name: /close chat/i });
    fireEvent.click(closeButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
