import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WORKFORCE_WORKSPACE, PROJECT_WORKSPACE, resolveWorkspaces } from "../registry";
import { WorkspaceHome } from "./workspace-home";

/**
 * A workspace's own front page.
 *
 * The property worth testing is a negative: this screen prints nothing it was
 * not told. No counts, because no read publishes them — and a "0" that means
 * "unread" is worse than no number. No payment promise beyond the mode Django
 * sent, because that sentence is the one deciding whether a Partner expects
 * Vsolve to hold their money.
 */

function workspace(key: string, actions: string[], commercialMode: string | null) {
  const [resolved] = resolveWorkspaces([
    { workspaceKey: key, commercialMode, actions },
  ]);
  return resolved!;
}

describe("what the page says about money", () => {
  it("tells an A3 agency the customer pays them directly", () => {
    render(<WorkspaceHome workspace={workspace(WORKFORCE_WORKSPACE, [], "LEAD_ONLY")} />);
    expect(screen.getByText(/customer pays you directly/i)).toBeInTheDocument();
  });

  it("tells an A5 vendor that Vsolve holds each stage", () => {
    render(
      <WorkspaceHome
        workspace={workspace(PROJECT_WORKSPACE, [], "MANAGED_PAYMENT_REQUIRED")}
      />,
    );
    expect(screen.getByText(/holds the money for each stage/i)).toBeInTheDocument();
  });

  it("says nothing at all for a mode it does not recognise", () => {
    // The failure this prevents is the worst kind: a policy change ships, the
    // key still looks like A3, and the app keeps promising the old arrangement
    // to somebody deciding whether to take a job on it.
    const { container } = render(
      <WorkspaceHome workspace={workspace(WORKFORCE_WORKSPACE, [], "SOMETHING_NEW")} />,
    );

    expect(container.textContent).not.toMatch(/pays you directly/i);
    expect(container.textContent).not.toMatch(/holds the money/i);
  });

  it("says nothing when the server omitted the mode", () => {
    const { container } = render(
      <WorkspaceHome workspace={workspace(WORKFORCE_WORKSPACE, [], null)} />,
    );
    expect(container.textContent).not.toMatch(/pays you|holds the money/i);
  });
});

describe("where the page leads", () => {
  it("links only to destinations the grant authorized", () => {
    render(
      <WorkspaceHome workspace={workspace(WORKFORCE_WORKSPACE, ["enquiry.view"], "LEAD_ONLY")} />,
    );

    expect(screen.getByRole("link", { name: /enquiries/i })).toHaveAttribute(
      "href",
      "/workforce/enquiries",
    );
    expect(screen.queryByRole("link", { name: /crew/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /shifts/i })).toBeNull();
  });

  it("does not link to the page being read", () => {
    render(
      <WorkspaceHome workspace={workspace(WORKFORCE_WORKSPACE, ["enquiry.view"], "LEAD_ONLY")} />,
    );

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).not.toContain("/workforce");
  });

  it("stays readable when every action was stripped", () => {
    // 0012 §A1 expresses a suspension by reducing the actions to none. The
    // workspace is still the Partner's, so it still renders and says why there
    // is nothing in it.
    render(<WorkspaceHome workspace={workspace(WORKFORCE_WORKSPACE, [], "LEAD_ONLY")} />);

    expect(screen.getByRole("heading", { name: "Workforce" })).toBeInTheDocument();
    expect(screen.getByText(/nothing in this workspace is available to you/i)).toBeInTheDocument();
  });
});

describe("what the page refuses to invent", () => {
  it("shows no counts, because nothing publishes them yet", () => {
    const { container } = render(
      <WorkspaceHome
        workspace={workspace(
          WORKFORCE_WORKSPACE,
          ["enquiry.view", "attendance.confirm", "crew.manage"],
          "LEAD_ONLY",
        )}
      />,
    );

    // No standalone number anywhere: a fabricated "0 shifts today" on a day with
    // three shifts is a lie the Partner has no way to check.
    expect(container.textContent).not.toMatch(/\b\d+\b/);
  });

  it("keeps each lifecycle's own noun", () => {
    render(
      <WorkspaceHome
        workspace={workspace(PROJECT_WORKSPACE, ["stage.submit_evidence"], null)}
      />,
    );

    expect(screen.getByRole("link", { name: /stages/i })).toBeInTheDocument();
    expect(screen.queryByText(/work item/i)).toBeNull();
  });
});
