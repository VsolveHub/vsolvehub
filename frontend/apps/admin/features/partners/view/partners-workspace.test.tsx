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

const { PartnersWorkspace } = await import("./partners-workspace");

afterEach(() => vi.restoreAllMocks());

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
});
