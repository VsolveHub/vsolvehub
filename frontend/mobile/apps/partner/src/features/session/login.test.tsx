import { render } from "@testing-library/react-native";

import LoginScreen from "../../../app/login";

const mockFlow = {
  phase: "phone" as "phone" | "code",
  phone: "",
  onPhoneChange: jest.fn(),
  code: "",
  onCodeChange: jest.fn(),
  onRequestCode: jest.fn(),
  onVerifyCode: jest.fn(),
  onResendCode: jest.fn(),
  onChangeNumber: jest.fn(),
  canRequest: false,
  canVerify: false,
  isRequesting: false,
  isVerifying: false,
  resendInSeconds: 0,
  expiresInSeconds: null as number | null,
  isExpired: false,
  phoneError: null as string | null,
  codeError: null as string | null,
  failure: null,
  developmentCode: null as string | null,
  codeLength: 6,
};

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/features/application/queries", () => ({
  usePartnerApplication: () => ({ isPending: false, data: undefined, error: null }),
}));

jest.mock("@vsolve/mobile-core", () => ({
  useAuthStore: (select: (state: { status: string }) => unknown) => select({ status: "signedOut" }),
  useMobileOtpFlow: () => mockFlow,
}));

describe("login", () => {
  it("renders the phone step", async () => {
    mockFlow.phase = "phone";
    mockFlow.codeError = null;
    const view = await render(<LoginScreen />);
    expect(view.getByText(/Welcome back/i)).toBeTruthy();
    expect(view.getByText("Send code")).toBeTruthy();
  });

  it("renders the phone app sign-in without the website header", async () => {
    mockFlow.phase = "phone";
    mockFlow.codeError = null;
    const view = await render(<LoginScreen />);
    expect(view.queryByText("Join")).toBeNull();
    expect(view.getByText("Register as a new Partner")).toBeTruthy();
    expect(view.getByText("Need help with your phone number or OTP?")).toBeTruthy();
  });

  it("renders a phone number error", async () => {
    mockFlow.phase = "phone";
    mockFlow.phoneError = "Enter your 10-digit mobile number.";
    const view = await render(<LoginScreen />);
    expect(view.getByText("Enter your 10-digit mobile number.")).toBeTruthy();
    mockFlow.phoneError = null;
  });

  it("renders a code error", async () => {
    mockFlow.phase = "code";
    mockFlow.codeError = "That code is not right, or it has expired. Check the code, or request a new one.";
    const view = await render(<LoginScreen />);
    expect(view.getByText("That code is not right, or it has expired. Check the code, or request a new one.")).toBeTruthy();
  });
});
