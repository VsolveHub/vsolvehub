import { render, screen } from "@testing-library/react-native";

import { VisitStartCode, showsStartCode } from "./visit-start-code";

const mutate = jest.fn();
let mockOtp: { isIdle: boolean; isError: boolean; error: unknown; data?: { code: string }; mutate: jest.Mock } = {
  isIdle: true,
  isError: false,
  error: null,
  mutate,
};

jest.mock("@/features/visit/queries", () => ({
  useVisit: () => ({ data: { version: 7 } }),
  useRequestStartOtp: () => mockOtp,
}));

describe("VisitStartCode", () => {
  beforeEach(() => {
    mutate.mockClear();
    mockOtp = { isIdle: true, isError: false, error: null, mutate };
  });

  it("shows only once the professional has arrived", () => {
    expect(showsStartCode("ARRIVED")).toBe(true);
    expect(showsStartCode("CONFIRMED")).toBe(false);
    expect(showsStartCode("IN_PROGRESS")).toBe(false);
  });

  it("asks for the code by itself on arrival, with the visit's real version", async () => {
    await render(<VisitStartCode bookingId="b1" status="ARRIVED" />);
    expect(mutate).toHaveBeenCalledWith({ bookingId: "b1", expectedVersion: 7 });
  });

  it("draws nothing and asks for nothing before arrival", async () => {
    await render(<VisitStartCode bookingId="b1" status="CONFIRMED" />);
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByText("Your start code")).toBeNull();
  });

  it("shows the code the server returned, not a development field", async () => {
    mockOtp = { ...mockOtp, isIdle: false, data: { code: "4729" } };
    await render(<VisitStartCode bookingId="b1" status="ARRIVED" />);
    expect(screen.getByLabelText("Start code 4 7 2 9")).toBeTruthy();
  });
});
