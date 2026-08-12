import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MaterialEditNotice } from "./material-edit-notice";

/**
 * `M2-FE-211` / `GAP-015`.
 *
 * The property under test is not "a dialog appears". It is that a Customer is
 * told what changing a live request costs **other people** — professionals who
 * already read it, priced it and started a clock against it — before they are
 * asked to confirm, and that they are never asked to confirm something the
 * platform cannot do.
 */

describe("before anyone has seen it", () => {
  it("says so, and does not warn about a consequence that does not exist", () => {
    const onEditFreely = vi.fn();
    render(<MaterialEditNotice stance="free" onEditFreely={onEditFreely} />);

    expect(screen.getByText(/nobody has seen this request yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/starts again/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /continue editing/i }));
    expect(onEditFreely).toHaveBeenCalledTimes(1);
  });
});

describe("once professionals hold it", () => {
  it("states both consequences before offering anything", () => {
    render(<MaterialEditNotice stance="vendor_visible" onConfirmEdit={vi.fn()} />);

    // Who is told, and what restarts. Either one alone is half the decision.
    expect(screen.getByText(/everyone who was asked is told/i)).toBeInTheDocument();
    expect(screen.getByText(/starts again from the change/i)).toBeInTheDocument();
  });

  it("separates a material edit from a correction, so the warning stays credible", () => {
    render(<MaterialEditNotice stance="vendor_visible" onConfirmEdit={vi.fn()} />);

    expect(screen.getByText(/correcting a phone number/i)).toBeInTheDocument();
  });

  it("takes an explicit confirmation and does not act on the first press", () => {
    const onConfirmEdit = vi.fn();
    render(<MaterialEditNotice stance="vendor_visible" onConfirmEdit={onConfirmEdit} />);

    fireEvent.click(screen.getByRole("button", { name: /change this request/i }));
    expect(onConfirmEdit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /yes, change it and tell them/i }));
    expect(onConfirmEdit).toHaveBeenCalledTimes(1);
  });

  it("lets the Customer back out with the request untouched", () => {
    const onConfirmEdit = vi.fn();
    render(<MaterialEditNotice stance="vendor_visible" onConfirmEdit={onConfirmEdit} />);

    fireEvent.click(screen.getByRole("button", { name: /change this request/i }));
    fireEvent.click(screen.getByRole("button", { name: /leave it as it is/i }));

    expect(onConfirmEdit).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /yes, change it and tell them/i }),
    ).not.toBeInTheDocument();
  });
});

describe("with no command behind it — the state today", () => {
  it("still explains the consequence", () => {
    // The explanation is the half that does not depend on an endpoint, and it
    // is the half `M2-FE-211` is mostly about.
    render(<MaterialEditNotice stance="vendor_visible" />);

    expect(screen.getByText(/starts again from the change/i)).toBeInTheDocument();
  });

  it("offers no confirmation, because confirming would reach a 409", () => {
    // `PATCH /requirements/{id}/` refuses anything that has left DRAFT with
    // `m2_requirement_locked`. Collecting a confirmation and then failing
    // teaches a Customer that confirming does nothing.
    render(<MaterialEditNotice stance="vendor_visible" supportAction={<a href="/x">Talk</a>} />);

    expect(screen.queryByRole("button", { name: /change this request/i })).not.toBeInTheDocument();
    expect(screen.getByText(/has to go through us/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Talk" })).toBeInTheDocument();
  });
});

describe("once it is closed", () => {
  it("says nothing at all", () => {
    // Nothing more will happen to it, so there is nothing to warn about — and a
    // notice about editing would imply there is something left to edit.
    const { container } = render(<MaterialEditNotice stance="closed" />);

    expect(container).toBeEmptyDOMElement();
  });
});
