import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

import { AssistantPopup, AssistantScreen } from "./assistant-screen";

const mockClient = { GET: jest.fn(), POST: jest.fn() };

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => mockClient,
  apiBaseUrl: () => "http://localhost:8000",
  useAuthStore: { getState: () => ({ token: "session-token" }) },
}));

const mockKvGet = jest.fn();
const mockKvSet = jest.fn<Promise<void>, [string, string]>(async () => undefined);
const mockKvRemove = jest.fn<Promise<void>, [string]>(async () => undefined);

jest.mock("@vsolve/mobile-core/storage", () => ({
  kvGet: (key: string) => mockKvGet(key),
  kvSet: (key: string, value: string) => mockKvSet(key, value),
  kvRemove: (key: string) => mockKvRemove(key),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The screen counts as in view from the start, as it is when someone opens the tab.
const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/(tabs)/catalog",
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(effect, [effect]);
  },
}));

const GREETING = "Hi! Tell me what you need done at home";

const created = {
  conversation_token: "token-1",
  conversation: {
    messages: [{ sequence: 1, sender: "assistant", text: GREETING, actions: [], created_at: "" }],
    is_answering: false,
    signed_in: true,
    has_open_booking: false,
  },
};

/** The chat is ready once its new conversation's token has been saved. */
function conversationReady(token = "token-1") {
  return waitFor(() => expect(mockKvSet).toHaveBeenCalledWith("assistant.conversation", token));
}

// A repeated name and a blank one: neither should become a chip.
const categories = [{ name: "AC Repair" }, { name: "AC Repair" }, { name: "  " }, { name: "Home Cleaning" }];

async function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AssistantScreen />
    </QueryClientProvider>,
  );
}

function reply(data: unknown, status = 201) {
  return { data, error: undefined, response: new Response(null, { status }) };
}

function failure(status: number) {
  return {
    data: undefined,
    error: { code: "assistant_unavailable", message: "The booking assistant is not available right now." },
    response: new Response(null, { status }),
  };
}

describe("AssistantScreen", () => {
  beforeEach(() => {
    mockClient.GET.mockReset();
    mockClient.POST.mockReset();
    // The screen reads the conversation, and the welcome reads the service categories.
    mockClient.GET.mockImplementation(async (path: string) =>
      path === "/api/v1/categories/" ? reply(categories, 200) : reply(created.conversation, 200),
    );
    mockKvGet.mockReset();
    mockKvGet.mockResolvedValue(null);
    mockKvSet.mockClear();
    mockKvRemove.mockClear();
  });

  it("keeps no chat history: no history button, and an old saved list is wiped from the phone", async () => {
    mockClient.POST.mockResolvedValue(reply(created));
    const screen = await renderScreen();

    await conversationReady();
    expect(screen.queryByLabelText("Chat history")).toBeNull();
    expect(mockKvRemove).toHaveBeenCalledWith("assistant.chats");
  });

  it("starts a fresh chat from New chat, but not when the open chat is still empty", async () => {
    const used = {
      ...created.conversation,
      messages: [
        ...created.conversation.messages,
        { sequence: 2, sender: "customer", text: "AC not cooling", actions: [], created_at: "" },
      ],
    };
    mockKvGet.mockImplementation(async (key: string) => (key === "assistant.conversation" ? "token-1" : null));
    // The old chat has a message; the fresh one (token-2) has only the greeting.
    mockClient.GET.mockImplementation(
      async (path: string, init?: { params?: { header?: Record<string, string> } }) => {
        if (path === "/api/v1/categories/") return reply(categories, 200);
        const token = init?.params?.header?.["X-Assistant-Token"];
        return reply(token === "token-1" ? used : created.conversation, 200);
      },
    );
    mockClient.POST.mockResolvedValue(reply({ ...created, conversation_token: "token-2" }));
    const screen = await renderScreen();
    await screen.findByText("AC not cooling");

    await fireEvent.press(screen.getByLabelText("New chat"));

    await conversationReady("token-2");
    expect(mockClient.POST).toHaveBeenCalledTimes(1);
    // The fresh chat is empty: New chat again does not start another one.
    await fireEvent.press(screen.getByLabelText("New chat"));
    expect(mockClient.POST).toHaveBeenCalledTimes(1);
  });

  it("offers each service category once as a starter chip and sends it as the first message", async () => {
    // The reply is still on its way, as it is for a few seconds in real life.
    const fetchMock = jest.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => undefined));
    mockClient.POST.mockResolvedValue(reply(created));
    const screen = await renderScreen();

    // The chips work once the conversation exists.
    await conversationReady();
    expect(await screen.findAllByText("AC Repair")).toHaveLength(1);
    expect(screen.getByText("Home Cleaning")).toBeTruthy();

    fireEvent.press(screen.getByText("AC Repair"));

    expect(await screen.findByText("I need AC Repair")).toBeTruthy();
    // The welcome and its chips stay at the top after a message is sent.
    expect(screen.getByText("How can I help you today?")).toBeTruthy();
    expect(screen.getByText("Home Cleaning")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const sent = fetchMock.mock.calls[0]?.[0] as Request;
    expect(sent.url).toContain("/api/v1/assistant/conversation/messages/");
    expect(await sent.text()).toContain("I need AC Repair");
    fetchMock.mockRestore();
  });

  it("shows the welcome without chips when the categories cannot be loaded", async () => {
    mockClient.GET.mockImplementation(async (path: string) =>
      path === "/api/v1/categories/" ? failure(500) : reply(created.conversation, 200),
    );
    mockClient.POST.mockResolvedValue(reply(created));
    const screen = await renderScreen();

    await conversationReady();
    expect(screen.getByText("How can I help you today?")).toBeTruthy();
    expect(screen.queryByText("AC Repair")).toBeNull();
    expect(screen.queryByText("Home Cleaning")).toBeNull();
  });

  it("starts a conversation with the app's welcome instead of the server's greeting", async () => {
    mockClient.POST.mockResolvedValue(reply(created));
    const screen = await renderScreen();

    await conversationReady();
    // The header carries only the V Solve Hub logo.
    expect(screen.getByLabelText("V Solve Hub")).toBeTruthy();
    // A new chat opens with the welcome until the customer says something.
    expect(screen.getByText("How can I help you today?")).toBeTruthy();
    expect(screen.queryByText(GREETING, { exact: false })).toBeNull();
  });

  it("hides only the opening greeting and keeps the rest of the conversation", async () => {
    const conversation = {
      ...created.conversation,
      messages: [
        ...created.conversation.messages,
        { sequence: 2, sender: "customer", text: "AC not cooling", actions: [], created_at: "" },
        { sequence: 3, sender: "assistant", text: "Which day suits you?", actions: [], created_at: "" },
      ],
    };
    mockClient.POST.mockResolvedValue(reply({ ...created, conversation }));
    mockClient.GET.mockImplementation(async (path: string) =>
      path === "/api/v1/categories/" ? reply(categories, 200) : reply(conversation, 200),
    );
    const screen = await renderScreen();

    expect(await screen.findByText("Which day suits you?")).toBeTruthy();
    expect(screen.getByText("AC not cooling")).toBeTruthy();
    expect(screen.queryByText(GREETING, { exact: false })).toBeNull();
    // A chat that already has messages still opens with the welcome and chips at the top.
    expect(screen.getByText("How can I help you today?")).toBeTruthy();
    expect(screen.getByText("AC Repair")).toBeTruthy();
  });

  describe("edit and delete", () => {
    const conversation = {
      ...created.conversation,
      messages: [
        ...created.conversation.messages,
        { sequence: 2, sender: "customer", text: "AC not cooling", actions: [], created_at: "" },
        { sequence: 3, sender: "assistant", text: "Which day suits you?", actions: [], created_at: "" },
      ],
    };

    async function openChat() {
      mockKvGet.mockImplementation(async (key: string) => (key === "assistant.conversation" ? "token-1" : null));
      mockClient.GET.mockImplementation(async (path: string) =>
        path === "/api/v1/categories/" ? reply(categories, 200) : reply(conversation, 200),
      );
      const screen = await renderScreen();
      // Tapping the latest message shows its tools.
      await fireEvent.press(await screen.findByText("AC not cooling"));
      expect(await screen.findByLabelText("Edit message")).toBeTruthy();
      expect(screen.getByLabelText("Delete message")).toBeTruthy();
      return screen;
    }

    /** The messages last saved as hidden on this phone. */
    function savedHidden() {
      const lastSave = mockKvSet.mock.calls.filter(([key]) => key === "assistant.hidden").at(-1);
      return JSON.parse(lastSave?.[1] ?? "[]") as number[];
    }

    it("edits inside the message and sends the new text in its place", async () => {
      const fetchMock = jest.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => undefined));
      const screen = await openChat();

      await fireEvent.press(screen.getByLabelText("Edit message"));
      const box = screen.getByLabelText("Edit your message");
      expect(box.props.value).toBe("AC not cooling");
      await fireEvent.changeText(box, "AC not cooling since yesterday");
      await fireEvent.press(screen.getByLabelText("Send edited message"));

      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(await (fetchMock.mock.calls[0]?.[0] as Request).text()).toContain("AC not cooling since yesterday");
      // The old message and the reply to it are hidden on this phone; the box at the bottom was not used.
      expect(savedHidden()).toEqual([2, 3]);
      expect(screen.queryByText("Which day suits you?")).toBeNull();
      expect(screen.getByLabelText("Your message").props.value).toBe("");
      fetchMock.mockRestore();
    });

    it("sends nothing when the edit is cancelled or unchanged", async () => {
      const fetchMock = jest.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => undefined));
      const screen = await openChat();

      await fireEvent.press(screen.getByLabelText("Edit message"));
      await fireEvent.press(screen.getByLabelText("Send edited message"));
      expect(screen.queryByLabelText("Edit your message")).toBeNull();

      await fireEvent.press(screen.getByText("AC not cooling"));
      await fireEvent.press(await screen.findByLabelText("Edit message"));
      await fireEvent.changeText(screen.getByLabelText("Edit your message"), "something else");
      await fireEvent.press(screen.getByLabelText("Cancel edit"));
      expect(screen.getByText("AC not cooling")).toBeTruthy();

      expect(fetchMock).not.toHaveBeenCalled();
      fetchMock.mockRestore();
    });

    it("deletes the message and the reply after it from this phone", async () => {
      const screen = await openChat();

      await fireEvent.press(screen.getByLabelText("Delete message"));

      await waitFor(() => expect(screen.queryByText("AC not cooling")).toBeNull());
      expect(screen.queryByText("Which day suits you?")).toBeNull();
      expect(savedHidden()).toEqual([2, 3]);
      // The welcome is still at the top.
      expect(screen.getByText("How can I help you today?")).toBeTruthy();
    });
  });

  describe("action cards", () => {
    async function renderWithActions(actions: unknown[]) {
      mockKvGet.mockImplementation(async (key: string) => (key === "assistant.conversation" ? "token-1" : null));
      mockClient.GET.mockImplementation(async (path: string) =>
        path === "/api/v1/categories/"
          ? reply(categories, 200)
          : reply(
              {
                ...created.conversation,
                messages: [{ sequence: 2, sender: "assistant", text: "Next step", actions, created_at: "" }],
              },
              200,
            ),
      );
      return renderScreen();
    }

    it("sends the login card to sign-in and back to the page the customer was on", async () => {
      mockPush.mockClear();
      const screen = await renderWithActions([{ action_type: "LOGIN", label: "Log in to continue" }]);
      fireEvent.press(await screen.findByText("Log in to continue"));
      expect(mockPush).toHaveBeenCalledWith("/login?next=%2Fcatalog");
    });

    it("reaches support for the Contact us card, since the app has no Contact page", async () => {
      mockPush.mockClear();
      const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
      const screen = await renderWithActions([{ action_type: "OPEN_LINK", label: "Contact us", href: "/contact" }]);
      fireEvent.press(await screen.findByText("Contact us"));
      expect(open).toHaveBeenCalledWith(expect.stringMatching(/^(tel:|mailto:)/));
      expect(mockPush).not.toHaveBeenCalled();
      open.mockRestore();
    });
  });

  it("shows the server's error and starts again when the person taps Try again", async () => {
    mockClient.POST.mockResolvedValueOnce(failure(503)).mockResolvedValueOnce(reply(created));
    const screen = await renderScreen();

    fireEvent.press(await screen.findByText("Try again"));

    await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(2));
    await conversationReady();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("shows the animated replying indicator while the assistant is answering", async () => {
    const answeringConversation = {
      ...created.conversation,
      is_answering: true,
    };
    mockKvGet.mockImplementation(async (key: string) =>
      key === "assistant.conversation" ? "token-1" : null,
    );
    mockClient.GET.mockImplementation(async (path: string) =>
      path === "/api/v1/categories/" ? reply(categories, 200) : reply(answeringConversation, 200),
    );
    const screen = await renderScreen();

    expect(await screen.findByLabelText("The assistant is replying")).toBeTruthy();
  });

  it("toggles reply alert mute state from the header and saves it", async () => {
    mockClient.POST.mockResolvedValue(reply(created));
    const screen = await renderScreen();

    await conversationReady();
    fireEvent.press(screen.getByLabelText("Mute reply alerts"));

    expect(await screen.findByLabelText("Unmute reply alerts")).toBeTruthy();
    expect(mockKvSet).toHaveBeenCalledWith("assistant.muted", "true");
  });

  it("renders AssistantPopup with the dark navy popup header and close button on desktop", async () => {
    mockClient.POST.mockResolvedValue(reply(created));
    const onClose = jest.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <AssistantPopup isDesktop onClose={onClose} />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Booking assistant")).toBeTruthy();
    expect(screen.getByText("Tell me what you need done at home")).toBeTruthy();
    await conversationReady();

    await fireEvent.press(screen.getByLabelText("Close the assistant"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders AssistantPopup as a bottom sheet on mobile and dismisses on backdrop tap", async () => {
    mockClient.POST.mockResolvedValue(reply(created));
    const onClose = jest.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <AssistantPopup isDesktop={false} onClose={onClose} />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Booking assistant")).toBeTruthy();
    await conversationReady();

    await fireEvent.press(screen.getByLabelText("Dismiss booking assistant"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
