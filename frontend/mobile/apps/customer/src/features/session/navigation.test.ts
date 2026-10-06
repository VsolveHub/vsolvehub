import { isCustomerTabActive, requiresCustomerSignIn } from "./navigation";

describe("customer navigation", () => {
  it("gates the signed-in trees and leaves home and services public", () => {
    expect(requiresCustomerSignIn("/account")).toBe(true);
    expect(requiresCustomerSignIn("/account/privacy")).toBe(true);
    expect(requiresCustomerSignIn("/bookings/abc")).toBe(true);
    expect(requiresCustomerSignIn("/requests")).toBe(true);
    expect(requiresCustomerSignIn("/")).toBe(false);
    expect(requiresCustomerSignIn("/catalog")).toBe(false);
    expect(requiresCustomerSignIn("/login")).toBe(false);
  });

  it("keeps the Bookings tab active on activity and bookings", () => {
    expect(isCustomerTabActive("/activity", "/activity")).toBe(true);
    expect(isCustomerTabActive("/activity", "/bookings/group")).toBe(true);
    expect(isCustomerTabActive("/activity", "/catalog")).toBe(false);
    expect(isCustomerTabActive("/", "/")).toBe(true);
    expect(isCustomerTabActive("/", "/catalog")).toBe(false);
    expect(isCustomerTabActive("/catalog", "/catalog/cleaning")).toBe(true);
  });
});
