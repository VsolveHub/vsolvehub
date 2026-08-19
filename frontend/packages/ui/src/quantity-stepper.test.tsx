import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { QuantityStepper } from "./quantity-stepper";

/**
 * The stepper's contract is mostly accessibility, so that is mostly what is
 * asserted: the group has a name, the buttons say what they change, and the
 * value is announced rather than merely displayed.
 */

function Harness({ min, max, start = 1 }: { min?: number; max?: number; start?: number }) {
  const [value, setValue] = useState(start);
  return (
    <QuantityStepper
      label="People"
      value={value}
      onChange={setValue}
      min={min}
      max={max}
      decrementLabel="Fewer people"
      incrementLabel="More people"
      unit="people"
    />
  );
}

describe("QuantityStepper", () => {
  it("names the group and both controls", () => {
    render(<Harness />);

    expect(screen.getByRole("group", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fewer people" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More people" })).toBeInTheDocument();
  });

  it("announces the value with its unit", () => {
    render(<Harness start={3} />);

    // The digit is `aria-hidden` and the spoken form carries the noun, so a
    // screen reader hears "3 people" rather than a bare "3".
    expect(screen.getByRole("status")).toHaveTextContent("3 people");
  });

  it("steps up and down", () => {
    render(<Harness start={2} />);

    fireEvent.click(screen.getByRole("button", { name: "More people" }));
    expect(screen.getByRole("status")).toHaveTextContent("3 people");

    fireEvent.click(screen.getByRole("button", { name: "Fewer people" }));
    expect(screen.getByRole("status")).toHaveTextContent("2 people");
  });

  it("disables rather than hides the control at the floor", () => {
    render(<Harness min={1} start={1} />);

    // Disabled, not absent: the control must not change width at the edge of
    // its range, and the customer should be able to see there is a floor.
    expect(screen.getByRole("button", { name: "Fewer people" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "More people" })).toBeEnabled();
  });

  it("disables the increment at the ceiling", () => {
    render(<Harness max={4} start={4} />);

    expect(screen.getByRole("button", { name: "More people" })).toBeDisabled();
  });

  it("clamps rather than trusting the disabled attribute alone", () => {
    const onChange = vi.fn();
    render(
      <QuantityStepper
        label="People"
        value={1}
        min={1}
        onChange={onChange}
        decrementLabel="Fewer people"
        incrementLabel="More people"
      />,
    );

    // A programmatic click bypasses the visual affordance; the handler still
    // must not emit a value under the floor.
    fireEvent.click(screen.getByRole("button", { name: "Fewer people" }));
    expect(onChange).not.toHaveBeenCalledWith(0);
  });

  it("associates the hint with the group", () => {
    render(
      <QuantityStepper
        label="People"
        value={1}
        onChange={() => {}}
        decrementLabel="Fewer people"
        incrementLabel="More people"
        hint="A supervisor is included with every crew."
      />,
    );

    expect(screen.getByRole("group", { name: "People" })).toHaveAccessibleDescription(
      "A supervisor is included with every crew.",
    );
  });
});
