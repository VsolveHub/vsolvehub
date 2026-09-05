import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BlockReason } from "../model/state";
import { ProjectBriefScreen, type BriefSectionSpec } from "./project-brief-screen";

const sections: BriefSectionSpec[] = [
  {
    title: "What needs doing",
    blocked: null,
    children: <p>Problem choices</p>,
  },
  {
    title: "Where and when",
    blocked: null,
    children: <p>Address and date</p>,
  },
  {
    title: "Choose visits & send",
    blocked: null,
    children: <p>Visit summary</p>,
  },
];

function withBlock(
  index: number,
  reason: BlockReason,
  source: BriefSectionSpec[] = sections,
): BriefSectionSpec[] {
  return source.map((section, i) => (i === index ? { ...section, blocked: reason } : section));
}

function renderBrief({
  activeIndex = 0,
  onSelectSection = vi.fn(),
  onContinue = vi.fn(),
  onSend = vi.fn(),
  onLeave = vi.fn(),
  briefSections = sections,
  blocked = null,
}: {
  activeIndex?: number;
  onSelectSection?: (index: number) => void;
  onContinue?: () => void;
  onSend?: () => void;
  onLeave?: () => void;
  briefSections?: BriefSectionSpec[];
  blocked?: BlockReason | null;
} = {}) {
  return {
    onSelectSection,
    onContinue,
    onSend,
    onLeave,
    ...render(
      <ProjectBriefScreen
        heading="Tell us about waterproofing"
        intro="This is a brief."
        sections={briefSections}
        activeIndex={activeIndex}
        onSelectSection={onSelectSection}
        onContinue={onContinue}
        onSend={onSend}
        onLeave={onLeave}
        sendLabel="Send this request"
        isSaving={false}
        blocked={blocked}
      />,
    ),
  };
}

describe("project brief navigation", () => {
  it("puts Continue in the rail on step 1 and does not keep Next or Back under the card", () => {
    const { onSelectSection, onContinue, onSend, onLeave } = renderBrief({ activeIndex: 0 });

    expect(screen.getByRole("button", { name: "Continue →" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send a request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send this request" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onLeave).toHaveBeenCalledOnce();
    expect(onSelectSection).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onSelectSection).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("goes back to step 1 from step 2 and continues to step 3 from the rail", () => {
    const { onSelectSection, onContinue, onSend } = renderBrief({ activeIndex: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onSelectSection).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByRole("button", { name: "Continue →" }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onSelectSection).toHaveBeenCalledOnce();
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("sends from the rail on the last step and does not duplicate the CTA under the card", () => {
    const { onSelectSection, onSend } = renderBrief({ activeIndex: 2 });

    expect(screen.getByRole("button", { name: "Send a request" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue →" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onSelectSection).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: "Send a request" }));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it("will not leave step 1 until the required answers are in", () => {
    const { onSelectSection, onContinue } = renderBrief({
      activeIndex: 0,
      briefSections: withBlock(0, "REQUIRED_ANSWER_MISSING"),
      blocked: "REQUIRED_ANSWER_MISSING",
    });

    const continueButton = screen.getByRole("button", { name: "Continue →" });
    expect(continueButton).toBeDisabled();
    expect(
      screen.getAllByText("Please answer the questions marked required.").length,
    ).toBeGreaterThan(0);

    fireEvent.click(continueButton);
    expect(onContinue).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Where and when/ }));
    fireEvent.click(screen.getByRole("button", { name: /Choose visits & send/ }));
    expect(onSelectSection).not.toHaveBeenCalled();
  });

  it("will not leave step 2 until a start date is chosen", () => {
    const { onSelectSection, onContinue } = renderBrief({
      activeIndex: 1,
      briefSections: withBlock(1, "START_DATE_NOT_CHOSEN"),
      blocked: "START_DATE_NOT_CHOSEN",
    });

    const continueButton = screen.getByRole("button", { name: "Continue →" });
    expect(continueButton).toBeDisabled();
    expect(screen.getAllByText("Choose when the work should start.").length).toBeGreaterThan(0);

    fireEvent.click(continueButton);
    expect(onContinue).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Choose visits & send/ }));
    expect(onSelectSection).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /What needs doing/ }));
    expect(onSelectSection).toHaveBeenCalledWith(0);
  });
});
