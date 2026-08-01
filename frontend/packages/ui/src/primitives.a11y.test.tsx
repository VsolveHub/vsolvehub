import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { Field } from "./field";
import { Input } from "./input";
import { Readout } from "./readout";
import { Select } from "./select";
import { Stepper } from "./stepper";

/**
 * Accessibility acceptance for B1.
 *
 * These assert the criteria in tasks.md rather than implementation detail, so
 * they keep holding if a component is restyled.
 */

describe("Button", () => {
  it("defaults to type=button so it cannot submit a form by accident", () => {
    render(<Button>Continue</Button>);
    expect(screen.getByRole("button", { name: "Continue" })).toHaveAttribute("type", "button");
  });

  it("marks itself busy and blocks activation while loading", () => {
    render(
      <Button loading loadingLabel="Confirming payment">
        Pay ₹199
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
  });

  it("announces what is happening, not just that something is", () => {
    render(
      <Button loading loadingLabel="Confirming payment">
        Pay ₹199
      </Button>,
    );
    expect(screen.getByText("Confirming payment")).toBeInTheDocument();
  });

  it("keeps the label mounted while loading so width cannot shift", () => {
    render(
      <Button loading loadingLabel="Working">
        Pay ₹199
      </Button>,
    );
    // Present in the DOM (reserving width) even though visually hidden.
    expect(screen.getByText("Pay ₹199")).toBeInTheDocument();
  });

  it("keeps the deprecated accent variant working", () => {
    // 3 existing call sites still pass it; removing it would break them.
    render(<Button variant="accent">Book now</Button>);
    expect(screen.getByRole("button", { name: "Book now" })).toBeEnabled();
  });
});

describe("Field", () => {
  it("associates its label with the control", () => {
    render(
      <Field label="Postal code">
        <Input />
      </Field>,
    );
    // getByLabelText only resolves when the association is real.
    expect(screen.getByLabelText(/Postal code/)).toBeInTheDocument();
  });

  it("associates description and error with the control for announcement", () => {
    render(
      <Field label="Phone number" description="We send the OTP here." error="Enter 10 digits.">
        <Input />
      </Field>,
    );

    const input = screen.getByLabelText(/Phone number/);
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    const ids = describedBy.split(" ").filter(Boolean);

    expect(ids).toHaveLength(2);
    const described = ids.map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("We send the OTP here.");
    expect(described.join(" ")).toContain("Enter 10 digits.");
  });

  it("marks the control invalid when an error is present", () => {
    render(
      <Field label="Phone number" error="Enter 10 digits.">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText(/Phone number/)).toHaveAttribute("aria-invalid", "true");
  });

  it("announces a validation error immediately via role=alert", () => {
    render(
      <Field label="Phone number" error="Enter 10 digits.">
        <Input />
      </Field>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Enter 10 digits.");
  });

  it("marks optional fields visibly rather than only marking required ones", () => {
    render(
      <Field label="Landmark">
        <Input />
      </Field>,
    );
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("conveys required state to assistive technology, not just with an asterisk", () => {
    render(
      <Field label="Phone number" required>
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText(/Phone number/)).toBeRequired();
  });
});

describe("Select", () => {
  it("does not preselect a real option when a placeholder is given", () => {
    // Plan 03: nothing the customer did not choose may appear chosen.
    render(
      <Field label="Time">
        <Select placeholder="Choose a time">
          <option value="10:00">10:00 am</option>
          <option value="11:00">11:00 am</option>
        </Select>
      </Field>,
    );
    expect(screen.getByLabelText(/Time/)).toHaveValue("");
  });

  it("renders the placeholder as a disabled option so it cannot be submitted", () => {
    render(
      <Field label="Time">
        <Select placeholder="Choose a time">
          <option value="10:00">10:00 am</option>
        </Select>
      </Field>,
    );
    expect(screen.getByRole("option", { name: "Choose a time" })).toBeDisabled();
  });
});

describe("Readout", () => {
  it("always pairs a value with a label", () => {
    render(<Readout label="Total payable" value="₹199" />);
    expect(screen.getByText("Total payable")).toBeInTheDocument();
    expect(screen.getByText("₹199")).toBeInTheDocument();
  });

  it("substitutes a calm announcement for a ticking value", () => {
    // The visible countdown must not be re-announced on every tick.
    render(
      <Readout
        label="Time remaining"
        value="04:32"
        announce="About 5 minutes remaining"
      />,
    );
    expect(screen.getByText("04:32")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("About 5 minutes remaining")).toBeInTheDocument();
  });

  it("opts numerals into tabular figures so digits do not jitter", () => {
    render(<Readout label="Time remaining" value="04:32" />);
    expect(screen.getByText("04:32")).toHaveAttribute("data-numeric");
  });
});

describe("Badge", () => {
  it("carries its meaning in text, never in colour alone", () => {
    render(<Badge tone="danger">Cancelled</Badge>);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("states what is absent and offers the next step", () => {
    render(
      <EmptyState
        title="No bookings yet"
        description="Your completed and upcoming visits will appear here."
        action={<Button>Browse services</Button>}
      />,
    );
    expect(screen.getByText("No bookings yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse services" })).toBeInTheDocument();
  });
});


describe("Stepper", () => {
  const steps = [
    { id: "address", title: "Where" },
    { id: "scope", title: "What you need" },
    { id: "window", title: "When" },
    { id: "review", title: "Review" },
  ];

  it("names the progress list", () => {
    render(<Stepper steps={steps} current={1} />);
    expect(screen.getByRole("list", { name: "Progress" })).toBeInTheDocument();
  });

  it("marks the active step so assistive technology can jump to it", () => {
    render(<Stepper steps={steps} current={1} />);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).not.toHaveAttribute("aria-current");
  });

  it("keeps every step title readable on a phone, where the labels are hidden", () => {
    // `hidden sm:inline` removes the visible label from the accessibility tree
    // too, so without the visually-hidden copy a screen reader hears "1 2 3 4"
    // on the one device where the flow matters most.
    render(<Stepper steps={steps} current={1} />);
    expect(screen.getByText("Step 1 of 4: Where, completed")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 4: What you need, current step")).toBeInTheDocument();
    expect(screen.getByText("Step 4 of 4: Review")).toBeInTheDocument();
  });

  it("does not announce the tick glyph as content", () => {
    render(<Stepper steps={steps} current={2} />);
    // The check mark is a shape, not a status; the status is in the sr-only text.
    expect(screen.queryByText("✓", { ignore: "[aria-hidden='true']" })).toBeNull();
  });

  it("carries state in text, not colour alone", () => {
    render(<Stepper steps={steps} current={0} />);
    expect(screen.getByText("Step 1 of 4: Where, current step")).toBeInTheDocument();
  });
});
