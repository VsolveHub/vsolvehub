import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "./dialog";

/**
 * `topLayer={false}` exists for the phone-login dialog. reCAPTCHA appends its
 * picture challenge to `<body>`; a `showModal()` dialog paints over it and makes
 * it inert, so the challenge cannot be solved and the code is never sent. These
 * pin the parts of modality the dialog then has to provide by hand.
 */
function LoginDialog({
  initiallyOpen = true,
  dismissable,
  onOpenChange = () => {},
}: {
  initiallyOpen?: boolean;
  dismissable?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Log in
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          setOpen(next);
        }}
        title="Log in to V Solve Hub"
        dismissable={dismissable}
        topLayer={false}
      >
        <input aria-label="Mobile number" />
      </Dialog>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Dialog kept out of the top layer", () => {
  it("opens with show(), not showModal()", () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const show = vi.spyOn(HTMLDialogElement.prototype, "show");

    render(<LoginDialog />);

    expect(screen.getByRole("dialog", { name: "Log in to V Solve Hub" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(show).toHaveBeenCalledTimes(1);
    expect(showModal).not.toHaveBeenCalled();
  });

  it("makes the page inert, but not what a third-party script adds while it is open", () => {
    // `container` is the page: Testing Library mounts it straight onto <body>.
    const { container } = render(<LoginDialog />);

    expect(container).toHaveAttribute("inert");
    expect(screen.getByRole("dialog").closest("[inert]")).toBeNull();

    // What reCAPTCHA does when it needs a picture challenge.
    const challenge = document.createElement("div");
    document.body.appendChild(challenge);
    expect(challenge).not.toHaveAttribute("inert");
    challenge.remove();
  });

  it("gives the page back when it closes", () => {
    const { container } = render(<LoginDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container).not.toHaveAttribute("inert");
  });

  it("closes on Escape and on a backdrop click", () => {
    const onOpenChange = vi.fn();
    render(<LoginDialog onOpenChange={onOpenChange} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const backdrop = screen.getByRole("dialog").previousElementSibling;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores Escape and the backdrop when it is not dismissable", () => {
    const onOpenChange = vi.fn();
    render(<LoginDialog dismissable={false} onOpenChange={onOpenChange} />);

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog").previousElementSibling as Element);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Dialog in the top layer (default)", () => {
  it("still opens with showModal()", () => {
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
