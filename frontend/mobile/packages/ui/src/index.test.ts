import { cn } from "./cn";
import { formatMoney } from "./readout";
import { useHydrated, useIsWideScreen } from "./index";

describe("@vsolve/mobile-ui", () => {
  it("exports the shared helpers", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
    expect(formatMoney(100)).toBe("₹1");
    expect(useHydrated()).toBe(true);
    expect(useIsWideScreen()).toBe(false);
  });
});
