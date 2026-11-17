import { act, fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";
import type { ReactElement } from "react";

import { ApplyDockContext, type DockConfig } from "../model/dock-context";
import type { DraftPeriod } from "../model/schedule";
import { AvailabilityEditor } from "./availability-editor";

const mockPush = router.push as jest.Mock;

const monday: DraftPeriod = {
  key: "mon-1",
  weekday: 0,
  startsAt: "09:00",
  endsAt: "18:00",
  endsNextDay: false,
  serviceAreaId: "area-1",
} as DraftPeriod;

function mount(props: Partial<React.ComponentProps<typeof AvailabilityEditor>> = {}) {
  const docks: (DockConfig | null)[] = [];
  const ui: ReactElement = (
    <ApplyDockContext.Provider value={{ dockConfig: null, registerDock: (config) => void docks.push(config) }}>
      <AvailabilityEditor
        areas={[{ id: "area-1", label: "Madhapur" }]}
        initialPeriods={[monday]}
        onSave={jest.fn()}
        backHref="/apply/areas"
        nextHref="/apply/documents"
        nextStepName="Documents"
        {...props}
      />
    </ApplyDockContext.Provider>
  );
  return { ui, docks };
}

const lastDock = (docks: (DockConfig | null)[]) => docks.filter(Boolean).at(-1) as DockConfig;

beforeEach(() => mockPush.mockClear());

describe("AvailabilityEditor", () => {
  it("has no button row of its own: Back and Continue belong to the apply dock", async () => {
    // Regression: "Back", "Save Hours" and "Review Application" were drawn under the list in one
    // row that ran off the right edge of a phone, and the last one skipped Documents.
    const { ui } = mount();
    const view = await render(ui);
    expect(view.queryByText("Save Hours")).toBeNull();
    expect(view.queryByText("Review Application")).toBeNull();
    expect(view.queryByText("Back")).toBeNull();
  });

  it("registers the real previous and next steps with the dock", async () => {
    const { ui, docks } = mount();
    await render(ui);
    const dock = lastDock(docks);
    expect(dock.backHref).toBe("/apply/areas");
    expect(dock.nextStepName).toBe("Documents");
    expect(dock.label).toBe("Continue");
  });

  it("goes straight to the next step when nothing has changed", async () => {
    const onSave = jest.fn();
    const { ui, docks } = mount({ onSave });
    await render(ui);
    await act(async () => lastDock(docks).onCommit());
    expect(onSave).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/apply/documents");
  });

  it("saves the changed hours first and moves on only once the server accepted them", async () => {
    const onSave = jest.fn();
    const { ui, docks } = mount({ onSave });
    const view = await render(ui);
    await fireEvent.press(view.getByLabelText("Clear Monday"));

    expect(lastDock(docks).label).toBe("Save and continue");
    await act(async () => lastDock(docks).onCommit());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();

    const onSaved = onSave.mock.calls[0][1] as () => void;
    await act(async () => onSaved());
    expect(mockPush).toHaveBeenCalledWith("/apply/documents");
  });

  it("a preset gives hours to every selected area, which Django needs before it accepts the application", async () => {
    // Regression: the presets filled only the first area, so five areas meant four to do by hand.
    const onSave = jest.fn();
    const { ui, docks } = mount({
      onSave,
      initialPeriods: [],
      areas: [
        { id: "area-1", label: "Madhapur" },
        { id: "area-2", label: "Gachibowli" },
        { id: "area-3", label: "Kondapur" },
      ],
    });
    const view = await render(ui);
    await fireEvent.press(view.getByText("Mon – Fri (9 AM – 6 PM)"));

    await act(async () => lastDock(docks).onCommit());
    const saved = onSave.mock.calls[0][0] as DraftPeriod[];
    expect(saved).toHaveLength(15);
    for (const area of ["area-1", "area-2", "area-3"]) {
      expect(saved.filter((period) => period.serviceAreaId === area).map((period) => period.weekday)).toEqual([
        0, 1, 2, 3, 4,
      ]);
    }
  });

  it("clears the dock when the screen goes away", async () => {
    const { ui, docks } = mount();
    const view = await render(ui);
    await view.unmount();
    expect(docks.at(-1)).toBeNull();
  });

  it("shows a save error in the dock instead of under the list", async () => {
    const { ui, docks } = mount({ saveError: "Your hours were not saved." });
    await render(ui);
    expect(lastDock(docks).refusal).toEqual({
      title: "We could not save your hours",
      message: "Your hours were not saved.",
    });
  });
});
