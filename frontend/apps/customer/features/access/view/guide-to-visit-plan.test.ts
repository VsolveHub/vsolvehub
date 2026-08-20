import { afterEach, describe, expect, it, vi } from "vitest";

import { guideToVisitPlanSelection } from "./guide-to-visit-plan";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("guideToVisitPlanSelection", () => {
  it("brings the estimate choices into view and focuses the first choice", () => {
    const chooser = document.createElement("section");
    chooser.dataset.visitPlanChooser = "";
    const choice = document.createElement("button");
    choice.setAttribute("role", "radio");
    chooser.append(choice);
    document.body.append(chooser);

    const scrollIntoView = vi.fn();
    chooser.scrollIntoView = scrollIntoView;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })) as unknown as typeof window.matchMedia,
    );

    guideToVisitPlanSelection();

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(choice).toHaveFocus();
  });

  it("does not animate scrolling for reduced-motion users", () => {
    const chooser = document.createElement("section");
    chooser.dataset.visitPlanChooser = "";
    chooser.append(document.createElement("button"));
    document.body.append(chooser);
    const scrollIntoView = vi.fn();
    chooser.scrollIntoView = scrollIntoView;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia,
    );

    guideToVisitPlanSelection();

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center" });
  });
});
