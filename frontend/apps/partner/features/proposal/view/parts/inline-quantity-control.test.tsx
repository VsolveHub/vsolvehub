import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { InlineQuantityControl } from "./inline-quantity-control";

function Harness({ initialValue = 0 }: { readonly initialValue?: number }) {
  const [value, setValue] = useState(initialValue);
  return (
    <InlineQuantityControl
      label="Quantity for Walkway with stands"
      value={value}
      onChange={setValue}
      decrementLabel="One fewer Walkway with stands"
      incrementLabel="One more Walkway with stands"
    />
  );
}

describe("InlineQuantityControl", () => {
  it("lets a partner type a large quantity directly", () => {
    render(<Harness />);
    const input = screen.getByRole("spinbutton", {
      name: "Quantity for Walkway with stands — type a number",
    });

    expect(input).toHaveAttribute("inputmode", "numeric");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "40" } });

    expect(input).toHaveValue("40");
    expect(input).toHaveAttribute("aria-valuenow", "40");
  });

  it("keeps the step buttons for quick corrections", () => {
    render(<Harness initialValue={40} />);

    fireEvent.click(screen.getByRole("button", { name: "One fewer Walkway with stands" }));
    expect(screen.getByRole("spinbutton")).toHaveValue("39");

    fireEvent.click(screen.getByRole("button", { name: "One more Walkway with stands" }));
    expect(screen.getByRole("spinbutton")).toHaveValue("40");
  });

  it("rejects non-digits and restores an unfinished empty edit", () => {
    render(<Harness initialValue={20} />);
    const input = screen.getByRole("spinbutton");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "20 feet" } });
    expect(input).toHaveValue("20");

    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    fireEvent.blur(input);
    expect(input).toHaveValue("20");
  });

  it("sends an explicit zero so the existing draft rule can remove the item", () => {
    const onChange = vi.fn<(value: number) => void>();
    render(
      <InlineQuantityControl
        label="Quantity for Walkway with stands"
        value={40}
        onChange={onChange}
        decrementLabel="One fewer Walkway with stands"
        incrementLabel="One more Walkway with stands"
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });
});
