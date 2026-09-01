import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { enquiryDetail } from "../fixtures";
import { readEnquiryRecord } from "../model/wire";
import { ClarificationThread } from "./clarification-thread";

// Mock the queries
vi.mock("../queries", () => ({
  useAskQuestion: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
  useAnswerQuestion: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

describe("ClarificationThread", () => {
  it("renders the floating chat button and opens full-page chat on click", () => {
    const enquiry = readEnquiryRecord(
      enquiryDetail({
        questions: [
          {
            id: "q-1",
            enquiry_id: "enq-1",
            question: "Is there a service lift?",
            asked_by_role: "VENDOR",
            asked_at: "2026-08-30T10:00:00Z",
            answer: "Yes, on the west side.",
            answered_at: "2026-08-30T10:05:00Z",
          },
        ],
      }),
    );

    render(<ClarificationThread enquiry={enquiry} />);

    // FAB button is present on the screen
    const fabButton = screen.getByRole("button", { name: /open chat with customer/i });
    expect(fabButton).toBeInTheDocument();

    // Open chat
    fireEvent.click(fabButton);

    // Chat header and messages are now displayed full page
    expect(screen.getByRole("dialog", { name: /chat with customer/i })).toBeInTheDocument();
    expect(screen.getByText("Is there a service lift?")).toBeInTheDocument();
    expect(screen.getByText("Yes, on the west side.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/type a message to the customer/i)).toBeInTheDocument();

    // Close chat
    const closeButton = screen.getByRole("button", { name: /close chat/i });
    fireEvent.click(closeButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
