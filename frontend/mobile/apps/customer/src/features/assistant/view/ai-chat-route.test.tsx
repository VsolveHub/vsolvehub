import { render } from "@testing-library/react-native";

import AiChatRoute from "../../../../app/(tabs)/ai-chat";

jest.mock("@/features/assistant/view/assistant-screen", () => {
  const { Text } = jest.requireActual("react-native");
  return { AssistantScreen: () => <Text>assistant screen</Text> };
});

describe("/ai-chat", () => {
  // The tab once shipped a "Hello World" placeholder while the chat screen sat unused.
  it("opens the booking assistant", async () => {
    const view = await render(<AiChatRoute />);
    expect(view.getByText("assistant screen")).toBeTruthy();
    expect(view.queryByText("Hello World")).toBeNull();
  });
});
