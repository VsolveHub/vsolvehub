import { render } from "@testing-library/react-native";

import { VisitDetail } from "./visit-detail";

jest.mock("@/features/access/queries", () => ({
  useVisitArrivalCode: () => ({ isPending: false, data: { code: "4821" } }),
  useVisitPlan: () => ({ isPending: false, data: { plan: null } }),
}));

test("visit detail shows the arrival code", async () => {
  const view = await render(<VisitDetail visitId="visit-1" />);
  expect(view.getByText("4821")).toBeTruthy();
});
