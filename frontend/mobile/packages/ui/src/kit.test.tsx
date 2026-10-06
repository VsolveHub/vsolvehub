import { render, userEvent } from "@testing-library/react-native";

import { ChoiceChips } from "./choice-chips";
import { FactTile } from "./fact-tile";
import { PageHeader } from "./page-header";
import { QuantityStepper } from "./quantity-stepper";
import { Text } from "./text";

describe("ChoiceChips", () => {
  it("reports the chosen value", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    const view = await render(
      <ChoiceChips
        label="Work type"
        name="work"
        value={null}
        onChange={onChange}
        options={[
          { value: "clean", label: "Cleaning" },
          { value: "paint", label: "Painting" },
        ]}
      />,
    );
    await user.press(view.getByRole("radio", { name: "Painting" }));
    expect(onChange).toHaveBeenCalledWith("paint");
  });
});

describe("QuantityStepper", () => {
  it("steps within the floor", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    const view = await render(
      <QuantityStepper
        label="People"
        value={1}
        onChange={onChange}
        decrementLabel="Remove a person"
        incrementLabel="Add a person"
      />,
    );
    await user.press(view.getByRole("button", { name: "Add a person" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

describe("FactTile", () => {
  it("shows a locked value", async () => {
    const view = await render(<FactTile icon={<Text>i</Text>} label="Address" value="Shared after you accept" locked />);
    expect(view.getByText("Shared after you accept")).toBeTruthy();
  });
});

describe("PageHeader", () => {
  it("renders the title", async () => {
    const view = await render(<PageHeader title="Bookings" description="Work in progress" />);
    expect(view.getByText("Bookings")).toBeTruthy();
    expect(view.getByText("Work in progress")).toBeTruthy();
  });
});
