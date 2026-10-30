import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OtpForm, type OtpFormProps } from "./otp-form";

/**
 * The form is presentational, so these assert what a person can perceive and
 * operate: labelled controls, an action that is only enabled when it will work,
 * announcements that are not a per-second stream, and no claim of a session the
 * server has not granted.
 */

function renderForm(overrides: Partial<OtpFormProps> = {}) {
  const props: OtpFormProps = {
    phase: "phone",
    phone: "",
    onPhoneChange: vi.fn(),
    code: "",
    onCodeChange: vi.fn(),
    onRequestCode: vi.fn(),
    onVerifyCode: vi.fn(),
    onResendCode: vi.fn(),
    onChangeNumber: vi.fn(),
    canRequest: false,
    canVerify: false,
    isRequesting: false,
    isVerifying: false,
    resendInSeconds: 0,
    expiresInSeconds: null,
    isExpired: false,
    codeLength: 6,
    ...overrides,
  };

  return { props, ...render(<OtpForm {...props} />) };
}

describe("phone step", () => {
  it("labels the number field visibly and tells people what will happen", () => {
    renderForm();
    expect(screen.getByLabelText(/mobile number/i)).toBeInTheDocument();
    expect(screen.getByText(/6-digit code by SMS/i)).toBeInTheDocument();
  });

  it("uses a numeric keypad and phone autofill", () => {
    renderForm();
    const input = screen.getByLabelText(/mobile number/i);
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "tel");
  });

  it("keeps the action disabled until the number can be submitted", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /send code/i })).toBeDisabled();
  });

  it("says how many digits are left while the action is still disabled", () => {
    renderForm({ phone: "99000", phoneDigits: 10 });
    expect(screen.getByText("5 more digits to go.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send code/i })).toBeDisabled();
  });

  it("keeps the SMS sentence when no digit count is given or nothing is typed", () => {
    renderForm({ phone: "99000" });
    expect(screen.getByText(/6-digit code by SMS/i)).toBeInTheDocument();
    renderForm({ phone: "", phoneDigits: 10 });
    expect(screen.getAllByText(/6-digit code by SMS/i)).toHaveLength(2);
  });

  it("submits on Enter as well as on the button", () => {
    const onRequestCode = vi.fn();
    renderForm({ canRequest: true, phone: "9876543210", onRequestCode });

    fireEvent.submit(screen.getByLabelText(/mobile number/i).closest("form")!);
    expect(onRequestCode).toHaveBeenCalledTimes(1);
  });

  it("announces a rejected number through the field, not a banner", () => {
    renderForm({ phoneError: "Enter a valid phone number." });
    const message = screen.getByRole("alert");
    expect(message).toHaveTextContent("Enter a valid phone number.");
    expect(screen.getByLabelText(/mobile number/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("says what is happening while a code is being sent", () => {
    renderForm({ canRequest: true, isRequesting: true });
    const button = screen.getByRole("button", { name: /sending code/i });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
  });
});

describe("code step", () => {
  const codeStep: Partial<OtpFormProps> = {
    phase: "code",
    phone: "9876543210",
    expiresInSeconds: 280,
  };

  it("keeps the number visible so a typo can still be spotted", () => {
    renderForm(codeStep);
    expect(screen.getByText("9876543210")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change number/i })).toBeEnabled();
  });

  it("offers one autofillable code input rather than six boxes", () => {
    renderForm(codeStep);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toHaveAttribute("autocomplete", "one-time-code");
    expect(inputs[0]).toHaveAttribute("maxlength", "6");
  });

  it("moves focus to the code field when the step opens", () => {
    renderForm(codeStep);
    expect(screen.getByLabelText(/6-digit code/i)).toHaveFocus();
  });

  it("does not announce the expiry countdown to a screen reader", () => {
    renderForm(codeStep);
    // Rendered for sighted users, hidden from assistive technology: a value
    // that changes every second would otherwise be read out every second.
    const countdown = screen.getByText(/code expires in/i);
    expect(countdown).toHaveAttribute("aria-hidden", "true");
    expect(countdown).toHaveTextContent("04:40");
  });

  it("blocks resend during the cooldown and still says when it will be ready", () => {
    const onResendCode = vi.fn();
    renderForm({ ...codeStep, resendInSeconds: 45, onResendCode });

    const resend = screen.getByRole("button", { name: /available in 45 seconds/i });
    expect(resend).toBeDisabled();
    fireEvent.click(resend);
    expect(onResendCode).not.toHaveBeenCalled();
  });

  it("enables resend once the server's cooldown has elapsed", () => {
    const onResendCode = vi.fn();
    renderForm({ ...codeStep, resendInSeconds: 0, onResendCode });

    fireEvent.click(screen.getByRole("button", { name: /^resend code$/i }));
    expect(onResendCode).toHaveBeenCalledTimes(1);
  });

  it("replaces the countdown with a recovery instruction once the code expires", () => {
    renderForm({ ...codeStep, isExpired: true, expiresInSeconds: 0 });
    expect(screen.getByRole("status")).toHaveTextContent(/expired\. Request a new one/i);
    expect(screen.queryByText(/code expires in/i)).not.toBeInTheDocument();
  });

  it("keeps verification disabled until the flow says it is submittable", () => {
    renderForm({ ...codeStep, canVerify: false });
    expect(screen.getByRole("button", { name: /verify and continue/i })).toBeDisabled();
  });

  it("takes a caller-supplied verify label, so the next step is not a surprise", () => {
    renderForm({ ...codeStep, canVerify: true, verifyLabel: "Verify and continue to payment" });
    expect(
      screen.getByRole("button", { name: "Verify and continue to payment" }),
    ).toBeEnabled();
  });

  it("shows the development code only when the server supplied one", () => {
    renderForm(codeStep);
    expect(screen.queryByText(/development delivery/i)).not.toBeInTheDocument();

    renderForm({ ...codeStep, developmentCode: "424242" });
    expect(screen.getByText(/development delivery/i)).toBeInTheDocument();
    expect(screen.getByText("424242")).toBeInTheDocument();
  });
});

describe("authenticated state", () => {
  it("shows only the number Django confirmed, and a way back out", () => {
    const onLogout = vi.fn();
    renderForm({ phase: "authenticated", signedInPhone: "+919876543210", onLogout });

    expect(screen.getByText("+919876543210")).toBeInTheDocument();
    expect(screen.queryByLabelText(/mobile number/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/6-digit code/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /use a different number/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("marks the logout control busy while the server is being told", () => {
    renderForm({
      phase: "authenticated",
      signedInPhone: "+919876543210",
      onLogout: vi.fn(),
      isLoggingOut: true,
    });
    expect(screen.getByRole("button", { name: /logging out/i })).toBeDisabled();
  });
});

describe("failure banner", () => {
  it("states what happened, what to do, and the support reference", () => {
    renderForm({
      failure: {
        title: "Too many code requests",
        message: "Wait a little before trying again.",
        severity: "warning",
        reference: "req_abc123",
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Too many code requests");
    expect(screen.getByText("req_abc123")).toBeInTheDocument();
  });
});

describe("page outline", () => {
  it("renders the heading at the level the surrounding page needs", () => {
    renderForm({ heading: "Log in to continue", headingLevel: 1 });
    expect(screen.getByRole("heading", { level: 1, name: "Log in to continue" })).toBeInTheDocument();
  });
});
