import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "./dialog";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Dialog", () => {
  it("opens with showModal(), in the top layer", () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");

    render(
      <Dialog open onOpenChange={() => {}} title="Remove item">
        body
      </Dialog>,
    );

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Remove item" })).not.toHaveAttribute("aria-modal");
  });
});
