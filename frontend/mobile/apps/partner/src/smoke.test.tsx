import { render } from "@testing-library/react-native";
import { Text } from "react-native";

test("renders the workspace marker", async () => {
  const view = await render(<Text>workspace ready</Text>);
  expect(view.getByText("workspace ready")).toBeTruthy();
});
