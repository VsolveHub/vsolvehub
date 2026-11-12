import { focusedHeaderTitle, getPartnerChromeMode, routeRequiresPartnerRole } from "./chrome";
import { homeForApplication, safeNextPath } from "./model/redirect";
import { PartnerGuardView } from "./partner-guard";
import { render } from "@testing-library/react-native";
import { I18nProvider } from "@vsolve/mobile-ui";
import { catalogs } from "../../i18n/catalogs";

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider locale="en-IN" catalog={catalogs["en-IN"]}>{ui}</I18nProvider>);
}

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
    const checking = await renderWithI18n(<PartnerGuardView branch="checking" />);
    expect(checking.getByText("Checking your access…")).toBeTruthy();
    const signin = await renderWithI18n(<PartnerGuardView branch="signin" />);
    expect(signin.getByText("Taking you to sign in…")).toBeTruthy();
    const switched = await renderWithI18n(<PartnerGuardView branch="switch" />);
    expect(switched.getByText("Switch to your Partner account")).toBeTruthy();
    const denied = await renderWithI18n(<PartnerGuardView branch="no-access" />);
    expect(denied.getByText("You do not have a Partner account")).toBeTruthy();
    const unknown = await renderWithI18n(<PartnerGuardView branch="approval-unknown" />);
    expect(unknown.getByText("We could not check your account")).toBeTruthy();
  });
});
