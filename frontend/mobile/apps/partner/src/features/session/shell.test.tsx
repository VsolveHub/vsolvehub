import { focusedHeaderTitle, getPartnerChromeMode, routeRequiresPartnerRole } from "./chrome";
import { homeForApplication, safeNextPath } from "./model/redirect";
import { PartnerGuardView } from "./partner-guard";
import { render } from "@testing-library/react-native";

describe("homeForApplication", () => {
  it("sends unfinished applications to apply", () => {
    expect(homeForApplication(null)).toBe("/apply");
    expect(homeForApplication("DRAFT")).toBe("/apply");
    expect(homeForApplication("CHANGES_REQUIRED")).toBe("/apply");
  });

  it("sends settled applications home", () => {
    expect(homeForApplication("SUBMITTED")).toBe("/home");
    expect(homeForApplication("APPROVED")).toBe("/home");
  });
});

describe("safeNextPath", () => {
  it("keeps a same-origin path and rejects an open redirect", () => {
    expect(safeNextPath("/home")).toBe("/home");
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("/login")).toBeNull();
  });
});

describe("chrome", () => {
  it("names focused screens the way the web header does", () => {
    expect(focusedHeaderTitle("/work/offers/1", null)).toBe("Work Offer");
    expect(focusedHeaderTitle("/work/enquiries/1/arrival", null)).toBe("Arrival code");
    expect(focusedHeaderTitle("/work/jobs/1", "Custom")).toBe("Custom");
  });

  it("keeps tabs off apply and on home", () => {
    expect(getPartnerChromeMode("/apply/about")).toBe("onboarding");
    expect(getPartnerChromeMode("/home")).toBe("full");
    expect(getPartnerChromeMode("/work/offers/1")).toBe("focused");
    expect(routeRequiresPartnerRole("/home")).toBe(false);
    expect(routeRequiresPartnerRole("/money")).toBe(true);
  });
});

describe("PartnerGuardView", () => {
  it("renders each access branch", async () => {
    const checking = await render(<PartnerGuardView branch="checking" />);
    expect(checking.getByText("Checking your access…")).toBeTruthy();
    const signin = await render(<PartnerGuardView branch="signin" />);
    expect(signin.getByText("Taking you to sign in…")).toBeTruthy();
    const switched = await render(<PartnerGuardView branch="switch" />);
    expect(switched.getByText("Switch to your Partner account")).toBeTruthy();
    const denied = await render(<PartnerGuardView branch="no-access" />);
    expect(denied.getByText("You do not have a Partner account")).toBeTruthy();
    const unknown = await render(<PartnerGuardView branch="approval-unknown" />);
    expect(unknown.getByText("We could not check your account")).toBeTruthy();
  });
});
