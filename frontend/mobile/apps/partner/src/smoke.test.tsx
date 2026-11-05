import { Text } from "@vsolve/mobile-ui";
import { render } from "@testing-library/react-native";


test("renders the workspace marker", async () => {
  const view = await render(<Text>workspace ready</Text>);
  expect(view.getByText("workspace ready")).toBeTruthy();
});
