import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { recoveryFor } from "../model/session-guard";
import { CapabilityNotice } from "./capability-notice";
import { WorkspaceSummaries } from "./workspace-summaries";

/**
 * Mid-session degradation and the global home, at the layer a Partner sees.
 *
 * Closes the rendered half of `M2-FE-112` and `M2-FE-113`. The guard's tests
 * prove the decisions; these prove the components carry them — including the
 * negative that matters most, which is that no recovery path leads to Jobs.
 */

describe("the capability notice", () => {
  it("says nothing when nothing changed", () => {
    const { container } = render(<CapabilityNotice recovery={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("never offers Jobs as the way out", () => {
    // The explicit prohibition in `M2-FE-113`, checked at the view as well as in
    // the guard. `/jobs` is the A1 task lifecycle; landing a workforce agency
    // there says their shifts became jobs.
    for (const availability of [
      { kind: "WITHDRAWN" },
      { kind: "UNKNOWN" },
      { kind: "UNVERIFIED" },
      { kind: "REDUCED", lostActions: ["crew.assign"] },
    ] as const) {
      const { container, unmount } = render(
        <CapabilityNotice recovery={recoveryFor(availability)} />,
      );

      const hrefs = [...container.querySelectorAll("a")].map((link) => link.getAttribute("href"));
      expect(hrefs, `${availability.kind} offered a Jobs link`).not.toContain("/jobs");
      unmount();
    }
  });

  it("sends a withdrawn Partner to the base app", () => {
    render(<CapabilityNotice recovery={recoveryFor({ kind: "WITHDRAWN" })} />);
    expect(screen.getByRole("link", { name: /home screen/i })).toHaveAttribute(
      "href",
      "/home",
    );
  });

  it("says committed work is unaffected", () => {
    // The question a Partner whose capability just vanished actually has.
    render(<CapabilityNotice recovery={recoveryFor({ kind: "WITHDRAWN" })} />);
    expect(screen.getByText(/already committed/i)).toBeInTheDocument();
  });

  it("offers a re-check only where a refetch could help", () => {
    const { unmount } = render(
      <CapabilityNotice recovery={recoveryFor({ kind: "UNVERIFIED" })} onRetry={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /check again/i })).toBeInTheDocument();
    unmount();

    render(<CapabilityNotice recovery={recoveryFor({ kind: "WITHDRAWN" })} onRetry={() => {}} />);
    expect(screen.queryByRole("button", { name: /check again/i })).toBeNull();
  });

  it("announces itself, because it appears without the Partner acting", () => {
    const { container } = render(<CapabilityNotice recovery={recoveryFor({ kind: "WITHDRAWN" })} />);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe("the global home summaries", () => {
  const WORKFORCE = {
    key: "A3_TIME_BLOCK",
    label: "Workforce",
    description: "Supply crew by the day or shift.",
    home: "/workforce",
    counts: [{ label: "shifts today", count: 3, href: "/workforce/shifts" }],
    isQuiet: false,
    needsAttention: false,
  };

  const PROJECTS = {
    key: "A5_CUSTOM_PROJECT",
    label: "Projects",
    description: "Quote for a defined outcome.",
    home: "/projects",
    counts: [{ label: "stages waiting", count: 2, href: "/projects/stages", needsAttention: true }],
    isQuiet: false,
    needsAttention: true,
  };

  it("renders nothing for an A1 partner", () => {
    // `M2-FE-111`: M2 must be invisible to the Partners it does not touch. An
    // empty section on every existing home would be a visible regression.
    const { container } = render(<WorkspaceSummaries summaries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps each lifecycle's own noun", () => {
    // The erasure `M2-FE-111` forbids. A shift is a shift and a stage is a
    // stage; one backend spine does not mean one word in the UI.
    render(<WorkspaceSummaries summaries={[WORKFORCE, PROJECTS]} />);

    expect(screen.getByText("shifts today")).toBeInTheDocument();
    expect(screen.getByText("stages waiting")).toBeInTheDocument();
  });

  it("uses no generic collective noun", () => {
    const { container } = render(<WorkspaceSummaries summaries={[WORKFORCE, PROJECTS]} />);
    expect(container.textContent?.toLowerCase()).not.toContain("work item");
  });

  it("links each count into its own workspace, never a merged view", () => {
    render(<WorkspaceSummaries summaries={[WORKFORCE, PROJECTS]} />);

    expect(screen.getByRole("link", { name: /3 shifts today/i })).toHaveAttribute(
      "href",
      "/workforce/shifts",
    );
    expect(screen.getByRole("link", { name: /2 stages waiting/i })).toHaveAttribute(
      "href",
      "/projects/stages",
    );
  });

  it("keeps a quiet workspace visible and says it is quiet", () => {
    // "Nothing right now" and "you no longer have this" must not look identical.
    render(
      <WorkspaceSummaries
        summaries={[{ ...WORKFORCE, counts: [], isQuiet: true, needsAttention: false }]}
      />,
    );

    expect(screen.getByText("Workforce")).toBeInTheDocument();
    expect(screen.getByText(/nothing waiting on you here/i)).toBeInTheDocument();
  });

  it("carries no record detail", () => {
    // A home screen is read in public and on a shared phone. Counts and labels
    // only — an aggregate that starts carrying record detail is the leak nobody
    // reviewed, arriving one field at a time.
    const { container } = render(<WorkspaceSummaries summaries={[WORKFORCE, PROJECTS]} />);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/₹/);
    expect(text).not.toMatch(/\+91/);
  });
});
