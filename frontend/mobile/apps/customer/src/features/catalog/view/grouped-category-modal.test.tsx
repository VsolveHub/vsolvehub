import { fireEvent, render } from "@testing-library/react-native";

import type { Category } from "../client-queries";
import { GroupedDesktopTile, GroupedMobileTile, RepairsTradesModal } from "./grouped-category-modal";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const TRADES: Category[] = [
  {
    id: "1",
    slug: "technician",
    name: "Technician",
    description: "Reviewed one-person Technician task visits.",
    icon_key: "wrench",
    image_url: "https://example.com/technician.png",
    subcategories: [],
  },
  {
    id: "2",
    slug: "electrician",
    name: "Electrician",
    description: "Wiring, fittings, fans and power faults, fixed in one visit.",
    icon_key: "zap",
    image_url: "https://example.com/electrician.jpg",
    subcategories: [],
  },
  {
    id: "3",
    slug: "plumber",
    name: "Plumber",
    description: "Taps, leaks, drains and fittings, fixed in one visit.",
    icon_key: "droplet",
    image_url: "https://example.com/plumber.jpg",
    subcategories: [],
  },
];

describe("RepairsTradesModal", () => {
  it("renders all three white trade cards with Explore links on desktop and selects categories", async () => {
    const onSelectCategory = jest.fn();
    const onClose = jest.fn();

    const view = await render(
      <RepairsTradesModal
        visible
        members={TRADES}
        isDesktop
        onSelectCategory={onSelectCategory}
        onClose={onClose}
      />,
    );

    expect(view.getByText("Technician, Electrician & Plumber")).toBeTruthy();
    expect(view.getByText("Choose the specialist you need.")).toBeTruthy();
    expect(view.getByText("Technician")).toBeTruthy();
    expect(view.getByText("Electrician")).toBeTruthy();
    expect(view.getByText("Plumber")).toBeTruthy();
    expect(view.getAllByText("Explore")).toHaveLength(3);

    await fireEvent.press(view.getByLabelText("Explore Electrician"));
    expect(onSelectCategory).toHaveBeenCalledWith(TRADES[1]);

    await fireEvent.press(view.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders desktop and mobile grouped tiles titled Technician, Electrician & Plumber with no extra sub-names", async () => {
    const desktopTile = await render(<GroupedDesktopTile members={TRADES} onPress={jest.fn()} />);
    expect(desktopTile.getByText("Technician, Electrician & Plumber")).toBeTruthy();
    expect(desktopTile.queryByText(/Technician · Electrician · Plumber/)).toBeNull();
    expect(desktopTile.queryByText(/Repairs & Maintenance/)).toBeNull();

    const mobileTile = await render(<GroupedMobileTile members={TRADES} onPress={jest.fn()} />);
    expect(mobileTile.getByText("Technician, Electrician & Plumber")).toBeTruthy();
    expect(mobileTile.queryByText(/Technician · Electrician · Plumber/)).toBeNull();
    expect(mobileTile.queryByText(/Repairs & Maintenance/)).toBeNull();
  });

  it("renders mobile bottom-sheet cards without throwing", async () => {
    const view = await render(
      <RepairsTradesModal
        visible
        members={TRADES}
        isDesktop={false}
        onSelectCategory={jest.fn()}
        onClose={jest.fn()}
      />,
    );

    expect(view.getByText("Technician, Electrician & Plumber")).toBeTruthy();
    expect(view.getByText("Technician")).toBeTruthy();
    expect(view.getByText("Electrician")).toBeTruthy();
    expect(view.getByText("Plumber")).toBeTruthy();
  });
});
