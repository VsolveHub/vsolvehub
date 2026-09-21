import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PHONE_COUNTRIES, PhoneField, toE164, toNationalDigits } from "./phone-field";
import { Field } from "./field";

const IN = PHONE_COUNTRIES.IN;

describe("toNationalDigits", () => {
  it("leaves an already-national number alone", () => {
    expect(toNationalDigits("9900000077", IN)).toBe("9900000077");
  });

  it("strips the dial code with and without the plus", () => {
    expect(toNationalDigits("+91 99000 00077", IN)).toBe("9900000077");
    expect(toNationalDigits("919900000077", IN)).toBe("9900000077");
  });

  it("strips the domestic trunk prefix", () => {
    expect(toNationalDigits("0 99000 00077", IN)).toBe("9900000077");
    expect(toNationalDigits("09876543210", IN)).toBe("9876543210");
  });

  it("keeps a ten-digit number that merely starts with the dial code", () => {
    // The regression this guards: a length check of `>=` would strip the leading
    // 91 from a legitimate number and submit a corrupt one.
    expect(toNationalDigits("9199000077", IN)).toBe("9199000077");
  });

  it("drops punctuation and spaces", () => {
    expect(toNationalDigits("99-0000-077", IN)).toBe("990000077");
    expect(toNationalDigits("+91 (99) 0000 0077", IN)).toBe("9900000077");
  });

  it("returns an over-long unrecognised number unchanged rather than truncating", () => {
    // Truncating would produce something that looks valid and fails later.
    expect(toNationalDigits("441234567890", IN)).toBe("441234567890");
  });

  it("returns an empty string for input with no digits", () => {
    expect(toNationalDigits("abc", IN)).toBe("");
  });
});

describe("toE164", () => {
  it("builds the wire format from any accepted shape", () => {
    expect(toE164("9900000077", IN)).toBe("+919900000077");
    expect(toE164("+91 99000 00077", IN)).toBe("+919900000077");
    expect(toE164("09876543210", IN)).toBe("+919876543210");
  });
});

describe("PhoneField", () => {
  it("reports normalised digits when a pasted dial code arrives", () => {
    const onValueChange = vi.fn();
    render(<PhoneField value="" onValueChange={onValueChange} aria-label="Contact phone" />);

    fireEvent.change(screen.getByLabelText("Contact phone"), {
      target: { value: "+91 99000 00077" },
    });

    expect(onValueChange).toHaveBeenCalledWith("9900000077");
  });

  it("renders the dial code as a fixture so the user never types it", () => {
    render(<PhoneField value="" onValueChange={() => {}} aria-label="Contact phone" />);
    expect(screen.getByText("+91")).toBeTruthy();
  });

  it("announces the country code to assistive technology", () => {
    render(<PhoneField value="" onValueChange={() => {}} aria-label="Contact phone" />);
    expect(screen.getByLabelText("Contact phone").getAttribute("aria-describedby")).toContain(
      "country-code",
    );
  });

  it("takes invalid state and the described-by ids from the surrounding Field", () => {
    render(
      <Field label="Contact phone" error="Enter a 10-digit mobile number" required>
        <PhoneField value="12345" onValueChange={() => {}} />
      </Field>,
    );

    const input = screen.getByLabelText(/Contact phone/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain("-error");
  });
});
