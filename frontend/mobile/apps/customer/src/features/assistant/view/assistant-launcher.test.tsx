import { act, fireEvent, render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import {
  AssistantNudgePill,
  AssistantTabOrb,
  FloatingAssistantOrb,
  ReplyPeekBanner,
} from "./assistant-launcher";
import { HelperBot } from "./welcome-hero";

describe("Assistant mobile launcher", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("renders the elevated Ask AI tab orb with equal column sizing and hitSlop", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <AssistantTabOrb active={false} unreadCount={2} onPress={onPress} />,
    );

    const tab = screen.getByRole("tab", { name: "Ask AI, 2 unread" });
    expect(tab.props.className).toContain("flex-1");
    expect(tab.props.className).toContain("min-w-0");
    expect(tab.props.hitSlop).toEqual({ top: 24, bottom: 4, left: 4, right: 4 });
    expect(screen.getByText("Ask AI")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    await fireEvent.press(tab);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps the HelperBot eye blinking animation active when animated", async () => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);

    const screen = await render(<HelperBot size={48} animated />);
    await act(async () => {
      await Promise.resolve();
    });

    // Open eyes initially: closed-eyelid path is not rendered.
    expect(JSON.stringify(screen.toJSON())).not.toContain("M41 55 Q47 59 53 55");

    // At 4.8s blink tick, closed-eyelid paths appear, then reopen after 140ms.
    await act(async () => {
      jest.advanceTimersByTime(4800);
    });
    expect(JSON.stringify(screen.toJSON())).toContain("M41 55 Q47 59 53 55");
    await act(async () => {
      jest.advanceTimersByTime(140);
    });
    expect(JSON.stringify(screen.toJSON())).not.toContain("M41 55 Q47 59 53 55");
  });

  it("hides the unread badge when the Ask AI tab is already active", async () => {
    const screen = await render(
      <AssistantTabOrb active unreadCount={3} onPress={jest.fn()} />,
    );

    expect(screen.queryByText("3")).toBeNull();
  });

  it("renders the desktop floating orb with unread indicator", async () => {
    const onPress = jest.fn();
    const screen = await render(<FloatingAssistantOrb unreadCount={1} onPress={onPress} />);

    const button = screen.getByRole("button", { name: "Open the booking assistant, 1 unread" });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows and dismisses the reply peek preview banner", async () => {
    const onOpen = jest.fn();
    const onDismiss = jest.fn();
    const screen = await render(
      <ReplyPeekBanner
        message={{
          sequence: 5,
          sender: "assistant",
          text: "Your AC quote is ₹499",
          actions: [],
          created_at: "",
        }}
        isDesktop={false}
        bottomOffset={94}
        onOpen={onOpen}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText("V Solve Hub AI")).toBeTruthy();
    expect(screen.getByText("Your AC quote is ₹499")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Open booking assistant reply"));
    expect(onOpen).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText("Dismiss reply preview"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders and dismisses the first-visit nudge pill", async () => {
    const onOpen = jest.fn();
    const onDismiss = jest.fn();
    const screen = await render(
      <AssistantNudgePill
        isDesktop={false}
        bottomOffset={94}
        onOpen={onOpen}
        onDismiss={onDismiss}
      />,
    );

    await fireEvent.press(screen.getByLabelText("Need help booking?"));
    expect(onOpen).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText("Dismiss chat suggestion"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
