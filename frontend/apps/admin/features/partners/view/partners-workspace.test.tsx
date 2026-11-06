import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/partners/view/partner-directory", () => ({
  PartnerDirectory: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <>
      <button onClick={() => onSelect("a")}>First</button>
      <button onClick={() => onSelect("b")}>Second</button>
    </>
  ),
}));
vi.mock("@/features/partners/view/partner-record", () => ({ PartnerRecord: () => null }));
const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search.value) }));

const { PartnersWorkspace } = await import("./partners-workspace");

afterEach(() => {
  vi.restoreAllMocks();
  search.value = "";
});

describe("partners workspace history", () => {
  it("pushes one entry for an open record, outside any state updater", () => {
    // It pushed from inside setState's updater, which React may run twice and
    // which updated the Router mid-render.
    const push = vi.spyOn(window.history, "pushState");
    const error = vi.spyOn(console, "error");
    render(<PartnersWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "First" }));
    fireEvent.click(screen.getByRole("button", { name: "Second" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it("opens the record a link names", () => {
    // The customer record links here with `?partner=` when the customer is also a partner.
    search.value = "partner=b";
    const push = vi.spyOn(window.history, "pushState");
    render(<PartnersWorkspace />);

    // Already open, so choosing it again adds no history entry of its own.
    fireEvent.click(screen.getByRole("button", { name: "Second" }));
    expect(push).not.toHaveBeenCalled();
  });
});
