import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import { cartMergeConflict } from "../conflicts";
import { conflict } from "../fixtures";
import { MergeDialog } from "./merge-dialog";

/**
 * The login merge, which no side may win silently.
 *
 * Django refuses to resolve an overlap on its own and asks for a decision per
 * item. The property under test is that this dialog cannot supply one: no
 * default, no preselection, and no way to send until every listed item has an
 * explicit choice.
 */

const duplicates = cartMergeConflict(
  conflict("cart_merge_conflict", {
    customer_cart_version: 2,
    session_cart_version: 5,
    conflicts: [
      { kind: "EXACT_DUPLICATE", customer_item_id: "c-1", session_item_id: "s-1" },
      { kind: "EXACT_DUPLICATE", customer_item_id: "c-2", session_item_id: "s-2" },
    ],
  }),
);

function renderDialog(overrides: Partial<Parameters<typeof MergeDialog>[0]> = {}) {
  const props = {
    conflict: duplicates,
    isMerging: false,
    errorMessage: null,
    onConfirm: vi.fn(),
    onRefresh: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<MergeDialog {...props} />);
  return props;
}

describe("choosing per duplicate", () => {
  it("offers exactly the three actions the contract publishes", () => {
    renderDialog();

    for (const label of [
      "Keep the one in my account",
      "Keep the one I just set up",
      "Keep both",
    ]) {
      expect(screen.getAllByLabelText(new RegExp(label, "i")).length).toBe(2);
    }
  });

  it("preselects nothing", () => {
    renderDialog();

    expect(
      screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked),
    ).toBe(true);
  });

  it("cannot send until every duplicate has an answer", () => {
    const props = renderDialog();
    const send = screen.getByRole("button", { name: /merge my bookings/i });

    expect(send).toBeDisabled();

    fireEvent.click(screen.getAllByRole("radio")[0]!);
    expect(send).toBeDisabled();
    expect(screen.getByText(/choose an option for every duplicate/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("radio")[3]!);
    expect(send).toBeEnabled();

    fireEvent.click(send);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("sends the generated action for each session item", () => {
    const props = renderDialog();

    // First duplicate: keep the account's copy. Second: keep both.
    fireEvent.click(screen.getAllByRole("radio")[0]!);
    fireEvent.click(screen.getAllByRole("radio")[5]!);
    fireEvent.click(screen.getByRole("button", { name: /merge my bookings/i }));

    expect(props.onConfirm).toHaveBeenCalledWith([
      { sessionItemId: "s-1", action: "KEEP_CUSTOMER" },
      { sessionItemId: "s-2", action: "KEEP_BOTH" },
    ]);
  });

  it("groups each duplicate's options so a choice cannot leak across items", () => {
    renderDialog();

    // Distinct radio names. Sharing one would make choosing for item two undo
    // the choice for item one.
    const names = new Set(
      screen.getAllByRole("radio").map((radio) => (radio as HTMLInputElement).name),
    );
    expect(names.size).toBe(2);
  });
});

describe("refusals no per-item choice can resolve", () => {
  it("explains a limit refusal instead of offering decisions", () => {
    const limit = cartMergeConflict(
      conflict("cart_merge_conflict", {
        customer_cart_version: 1,
        session_cart_version: 1,
        conflicts: [
          { kind: "CART_LIMIT_EXCEEDED", combined_item_count: 7, maximum_item_count: 5 },
        ],
      }),
    );
    renderDialog({ conflict: limit });

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/7 services/);
    expect(screen.getByRole("alert")).toHaveTextContent(/holds 5/);
  });

  it("sends a mid-merge version change back to server truth", () => {
    const changed = cartMergeConflict(
      conflict("cart_merge_conflict", {
        customer_cart_version: 3,
        session_cart_version: 6,
        conflicts: [{ kind: "CART_VERSION_CHANGED" }],
      }),
    );
    const props = renderDialog({ conflict: changed });

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reload my cart/i }));
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("dialog behaviour", () => {
  it("renders nothing when there is no conflict", () => {
    const { container } = render(
      <MergeDialog
        conflict={null}
        isMerging={false}
        errorMessage={null}
        onConfirm={vi.fn()}
        onRefresh={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is a labelled modal dialog", () => {
    renderDialog();
    expect(
      screen.getByRole("dialog", { name: /you already had a booking started/i }),
    ).toBeInTheDocument();
  });

  it("marks the send action busy while merging rather than disabling every control", () => {
    renderDialog({ isMerging: true });

    fireEvent.click(screen.getAllByRole("radio")[0]!);
    fireEvent.click(screen.getAllByRole("radio")[3]!);

    expect(screen.getByRole("button", { name: /merging/i })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("surfaces a refused merge rather than closing as though it worked", () => {
    renderDialog({ errorMessage: "Your cart changed. Review the latest cart." });
    expect(screen.getByRole("alert")).toHaveTextContent(/review the latest cart/i);
  });
});
