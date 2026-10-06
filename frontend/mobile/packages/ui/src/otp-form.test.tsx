import { render, userEvent } from "@testing-library/react-native";

import { OtpForm } from "./otp-form";

const base = {
  phone: "",
  onPhoneChange: jest.fn(),
  code: "",
  onCodeChange: jest.fn(),
  onRequestCode: jest.fn(),
  onVerifyCode: jest.fn(),
  onResendCode: jest.fn(),
  onChangeNumber: jest.fn(),
  canRequest: true,
  canVerify: false,
  isRequesting: false,
  isVerifying: false,
  resendInSeconds: 0,
  expiresInSeconds: null,
  isExpired: false,
  codeLength: 6,
};

describe("OtpForm", () => {
  it("sends a code from the phone step", async () => {
    const onRequestCode = jest.fn();
    const user = userEvent.setup();
    const view = await render(<OtpForm {...base} phase="phone" onRequestCode={onRequestCode} />);
    expect(view.getByText("Log in")).toBeTruthy();
    await user.press(view.getByRole("button", { name: "Send code" }));
    expect(onRequestCode).toHaveBeenCalled();
  });
});
