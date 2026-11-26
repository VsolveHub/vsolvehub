import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The website booking assistant: the welcome with category chips, the server's greeting
 * hidden, and edit / delete on the customer's latest message (same as the phone app).
 */

const DEFAULT_MESSAGES = [
  { sequence: 1, sender: "assistant", text: "Hello from the server", actions: [] },
  { sequence: 2, sender: "customer", text: "My AC is not cooling", actions: [] },
  { sequence: 3, sender: "assistant", text: "When should we come?", actions: [] },
  { sequence: 4, sender: "customer", text: "Tomorrow evening", actions: [] },
];

const hooks = vi.hoisted(() => ({
  hideMessages: vi.fn(),
  send: vi.fn(),
  hidden: [] as number[],
  isAnswering: false,
  messages: [
    { sequence: 1, sender: "assistant", text: "Hello from the server", actions: [] },
    { sequence: 2, sender: "customer", text: "My AC is not cooling", actions: [] },
    { sequence: 3, sender: "assistant", text: "When should we come?", actions: [] },
    { sequence: 4, sender: "customer", text: "Tomorrow evening", actions: [] },
  ],
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/features/catalog/client-queries", () => ({
  useCategories: () => ({ data: [{ name: "AC Repair" }, { name: "Plumbing" }, { name: "  " }] }),
}));
vi.mock("../queries", () => ({
  useAssistantToken: () => ({
    token: "t-1",
    loaded: true,
    hidden: hooks.hidden,
    save: vi.fn(),
    hideMessages: hooks.hideMessages,
  }),
  useStartConversation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useConversation: () => ({
    data: {
      is_answering: hooks.isAnswering,
      messages: hooks.messages,
    },
    error: null,
  }),
  useSendMessage: () => ({ mutate: hooks.send, isPending: false, error: null }),
}));

// jsdom has no element scrolling; the chat scrolls to the newest message.
Element.prototype.scrollTo = vi.fn();
vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ENABLED", "true");
const { AssistantWidget } = await import("./assistant-widget");

function openChat() {
  render(<AssistantWidget />);
  fireEvent.click(screen.getByRole("button", { name: "Open the booking assistant" }));
}

describe("AssistantWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    hooks.hidden = [];
    hooks.isAnswering = false;
    hooks.messages = [...DEFAULT_MESSAGES];
  });

  it("renders the helper bot icon launcher instead of Book by chat text", () => {
    render(<AssistantWidget />);
    const launcher = screen.getByRole("button", { name: "Open the booking assistant" });
    expect(launcher.querySelector("svg")).not.toBeNull();
    expect(launcher.querySelector(".assistant-bot-eyes")).not.toBeNull();
    expect(launcher).not.toHaveClass("assistant-bot-float");
    expect(screen.queryByText("Book by chat")).toBeNull();
  });

  it("shows the animated typing indicator while the assistant is answering", () => {
    hooks.isAnswering = true;
    openChat();
    expect(screen.getByText("Assistant is typing")).toBeInTheDocument();
  });

  it("toggles sound alerts from the assistant header", () => {
    openChat();
    const muteButton = screen.getByRole("button", { name: "Mute reply alerts" });
    fireEvent.click(muteButton);
    expect(screen.getByRole("button", { name: "Unmute reply alerts" })).toBeInTheDocument();
    expect(window.localStorage.getItem("vsolve.assistant.muted")).toBe("true");
  });

  it("shows an unread badge and peek preview when a reply arrives while minimized", () => {
    const { rerender } = render(<AssistantWidget />);
    expect(screen.queryByText("Your AC quote is ₹499")).toBeNull();

    hooks.messages = [
      ...DEFAULT_MESSAGES,
      { sequence: 5, sender: "assistant", text: "Your AC quote is ₹499", actions: [] },
    ];
    rerender(<AssistantWidget />);

    expect(
      screen.getByRole("button", { name: "Open the booking assistant, 1 unread" }),
    ).toBeInTheDocument();
    const preview = screen.getByText("Your AC quote is ₹499");
    expect(preview).toBeInTheDocument();

    fireEvent.click(preview);
    expect(screen.getByRole("dialog", { name: "Booking assistant" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /unread/ })).toBeNull();
  });

  it("shows the welcome with the server's categories as chips, and sends one when picked", () => {
    openChat();
    expect(screen.getByText("How can I help you today?")).toBeInTheDocument();
    // Blank names are left out.
    expect(screen.getAllByRole("button", { name: /AC Repair|Plumbing/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Plumbing" }));
    expect(hooks.send).toHaveBeenCalledWith("I need Plumbing", expect.anything());
  });

  it("does not show the server's opening greeting", () => {
    openChat();
    expect(screen.queryByText("Hello from the server")).toBeNull();
    expect(screen.getByText("When should we come?")).toBeInTheDocument();
  });

  it("offers edit and delete on the latest customer message only", () => {
    openChat();
    expect(screen.queryByRole("button", { name: /My AC is not cooling\. Show edit/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tomorrow evening\. Show edit/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete message" }));
    expect(hooks.hideMessages).toHaveBeenCalledWith([4]);
  });

  it("an edit hides the old message and sends the new text", () => {
    openChat();
    fireEvent.click(screen.getByRole("button", { name: /Tomorrow evening\. Show edit/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    fireEvent.change(screen.getByLabelText("Edit your message"), { target: { value: "Friday morning" } });
    fireEvent.click(screen.getByRole("button", { name: "Send edited message" }));
    expect(hooks.hideMessages).toHaveBeenCalledWith([4]);
    expect(hooks.send).toHaveBeenCalledWith("Friday morning", expect.anything());
  });

  it("keeps messages hidden in this browser out of the chat", () => {
    hooks.hidden = [4];
    openChat();
    expect(screen.queryByText("Tomorrow evening")).toBeNull();
  });
});
