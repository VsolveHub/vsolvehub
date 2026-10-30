import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { enquiryDetail } from "../fixtures";
import { readEnquiryRecord } from "../model/wire";
import { ClarificationThread } from "./clarification-thread";
import { withI18n } from "@/i18n/test-utils";

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

/**
 * The trigger is portalled into the shell's header slot, not floated over the
 * screen. `PartnerShell` renders that slot on every focused route; here the test
 * stands in for it, which is also the assertion — a thread mounted with no slot
 * renders no trigger rather than throwing, and the screen's other two entry
 * points (the customer card and the trouble sheet) still open it by prop.
 */
function mountHeaderSlot(): HTMLElement {
  const slot = document.createElement("div");
  slot.id = "partner-header-action";
  document.body.appendChild(slot);
  return slot;
}

describe("ClarificationThread", () => {
  afterEach(() => {
    document.getElementById("partner-header-action")?.remove();
  });

  it("renders its trigger in the header slot and opens full-page chat on click", () => {
    const slot = mountHeaderSlot();
    const enquiry = readEnquiryRecord(
      enquiryDetail({
        questions: [
          {
            id: "q-1",
            invitation: "enq-1",
            question: "Is there a service lift?",
            asked_by_role: "VENDOR",
            asked_at: "2026-08-30T10:00:00Z",
            answer: "Yes, on the west side.",
            answered_at: "2026-08-30T10:05:00Z",
          },
        ],
      }),
    );

    render(withI18n(<ClarificationThread enquiry={enquiry} />));

    const trigger = screen.getByRole("button", { name: /open chat with customer/i });
    expect(slot).toContainElement(trigger);

    fireEvent.click(trigger);

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

  it("renders no trigger on a route whose header has no slot", () => {
    const enquiry = readEnquiryRecord(enquiryDetail({ questions: [] }));

    render(withI18n(<ClarificationThread enquiry={enquiry} />));

    expect(
      screen.queryByRole("button", { name: /open chat with customer/i }),
    ).not.toBeInTheDocument();
  });

  it("opens from the outside when the screen controls it", () => {
    mountHeaderSlot();
    const enquiry = readEnquiryRecord(enquiryDetail({ questions: [] }));

    render(withI18n(<ClarificationThread enquiry={enquiry} open onOpenChange={() => {}} />));

    expect(screen.getByRole("dialog", { name: /chat with customer/i })).toBeInTheDocument();
  });
});
