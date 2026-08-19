import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChoiceChips } from "./choice-chips";

/**
 * The reason this is radios and not buttons: everything asserted below comes
 * from the platform. If a future version reaches for `<button>` and
 * `aria-pressed`, these break, which is the point.
 */

const OPTIONS = [
  { value: "ground", label: "Ground floor" },
  { value: "lift", label: "Lift" },
  { value: "stairs", label: "Stairs only" },
];

describe("ChoiceChips", () => {
  it("is a radiogroup with one radio per option", () => {
    render(
      <ChoiceChips
        label="Getting to the work"
        name="access"
        options={OPTIONS}
        value={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("radiogroup", { name: "Getting to the work" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("marks the selected option checked, not merely styled", () => {
    render(
      <ChoiceChips
        label="Getting to the work"
        name="access"
        options={OPTIONS}
        value="lift"
        onChange={() => {}}
      />,
    );

    // State survives greyscale and forced-colours because it is real.
    expect(screen.getByRole("radio", { name: "Lift" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Ground floor" })).not.toBeChecked();
  });

  it("reports the chosen value", () => {
    const onChange = vi.fn();
    render(
      <ChoiceChips
        label="Getting to the work"
        name="access"
        options={OPTIONS}
        value={null}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Stairs only" }));
    expect(onChange).toHaveBeenCalledWith("stairs");
  });

  it("keeps the radios focusable so arrow keys and the focus ring still work", () => {
    render(
      <ChoiceChips
        label="Getting to the work"
        name="access"
        options={OPTIONS}
        value="ground"
        onChange={() => {}}
      />,
    );

    // `sr-only`, never `hidden`. A hidden input is not focusable, which would
    // take arrow-key navigation and the visible focus ring with it.
    const radio = screen.getByRole("radio", { name: "Ground floor" });
    radio.focus();
    expect(radio).toHaveFocus();
  });

  it("renders a description in wrap layout", () => {
    render(
      <ChoiceChips
        label="The work"
        name="work"
        options={[{ value: "full", label: "Full fit-out", description: "Everything, start to end." }]}
        value={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("Everything, start to end.")).toBeInTheDocument();
  });

  it("disables every option together", () => {
    render(
      <ChoiceChips
        label="Getting to the work"
        name="access"
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        disabled
      />,
    );

    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
  });
});
