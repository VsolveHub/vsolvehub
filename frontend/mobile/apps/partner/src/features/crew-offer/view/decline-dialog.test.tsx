import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { CrewOfferDeclineDialog } from "./crew-offer-decline-dialog";

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderDialog(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>);
}

function tap(element: { props: { onClick?: (event: object) => void; onPress?: () => void } }) {
  if (element.props.onClick) {
    element.props.onClick({
      nativeEvent: {},
      currentTarget: 1,
      target: 1,
      stopPropagation() {},
    });
    return;
  }
  element.props.onPress?.();
}

test("decline dialog asks for a reason before it passes", async () => {
  const onDecline = jest.fn();
  const view = await renderDialog(
    <CrewOfferDeclineDialog open onOpenChange={jest.fn()} onDecline={onDecline} pending={false} />,
  );
  expect(view.getByText("Pass on this job?")).toBeTruthy();
  tap(view.getByRole("button", { name: "Pass" }));
  expect(await view.findByText("Choose a reason.")).toBeTruthy();
  expect(onDecline).not.toHaveBeenCalled();
  tap(view.getByRole("radio", { name: "Too far" }));
  expect(await view.findByText("We re-check your service areas.")).toBeTruthy();
  tap(view.getByRole("button", { name: "Pass" }));
  expect(onDecline).toHaveBeenCalledWith({ reasonCode: "TOO_FAR", note: "" });
});
