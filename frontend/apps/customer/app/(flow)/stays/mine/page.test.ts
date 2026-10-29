import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

const { default: MyStays } = await import("./page");
const { default: MyRentals } = await import("../../rentals/mine/page");

describe("the old My Stays and My Rentals pages", () => {
  it("send a bookmark to Your Bookings, filtered to that kind", () => {
    MyStays();
    expect(redirect).toHaveBeenLastCalledWith("/activity?type=stays");
    MyRentals();
    expect(redirect).toHaveBeenLastCalledWith("/activity?type=rentals");
  });
});
