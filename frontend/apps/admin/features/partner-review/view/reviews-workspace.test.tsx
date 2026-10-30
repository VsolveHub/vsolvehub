import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/partner-review/view/review-queue", () => ({
  ReviewQueue: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <>
      <button onClick={() => onSelect("a")}>First</button>
      <button onClick={() => onSelect("b")}>Second</button>
    </>
  ),
}));
vi.mock("@/features/partner-review/view/review-detail", () => ({ ReviewDetail: () => null }));

const { ReviewsWorkspace } = await import("./reviews-workspace");

afterEach(() => vi.restoreAllMocks());

describe("reviews workspace history", () => {
  it("pushes one entry for an open detail, however many applications are opened", () => {
    // Each selection used to push, so Back stepped through every application viewed.
    const push = vi.spyOn(window.history, "pushState");
    render(<ReviewsWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "First" }));
    fireEvent.click(screen.getByRole("button", { name: "Second" }));

    expect(push).toHaveBeenCalledTimes(1);
  });
});
