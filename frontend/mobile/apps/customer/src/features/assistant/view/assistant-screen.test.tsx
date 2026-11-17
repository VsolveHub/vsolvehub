import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { AssistantScreen } from "./assistant-screen";

const mockClient = { GET: jest.fn(), POST: jest.fn() };

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => mockClient,
  apiBaseUrl: () => "http://localhost:8000",
  useAuthStore: { getState: () => ({ token: "session-token" }) },
}));

const mockKvGet = jest.fn();
const mockKvSet = jest.fn<Promise<void>, [string, string]>(async () => undefined);

jest.mock("@vsolve/mobile-core/storage", () => ({
  kvGet: (key: string) => mockKvGet(key),
  kvSet: (key: string, value: string) => mockKvSet(key, value),
  kvRemove: jest.fn(async () => undefined),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

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
  });

  it("lists saved chats in the history sheet and forgets one that is deleted", async () => {
    const saved = [
      { token: "token-1", title: "AC not cooling" },
      { token: "token-9", title: "Fan installation" },
    ];
    mockKvGet.mockImplementation(async (key: string) =>
      key === "assistant.conversation" ? "token-1" : key === "assistant.chats" ? JSON.stringify(saved) : null,
    );
    const screen = await renderScreen();

    fireEvent.press(await screen.findByLabelText("Chat history"));
    expect(await screen.findByText("Fan installation")).toBeTruthy();
    expect(screen.getByText("AC not cooling")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Delete chat Fan installation"));

    await waitFor(() => expect(screen.queryByText("Fan installation")).toBeNull());
    const lastSave = mockKvSet.mock.calls.filter(([key]) => key === "assistant.chats").at(-1);
    expect(JSON.parse(lastSave?.[1] ?? "[]")).toEqual([{ token: "token-1", title: "AC not cooling" }]);
  });

  it("closes the history when the last chat is deleted and never lists the fresh blank chat", async () => {
    mockKvGet.mockImplementation(async (key: string) =>
      key === "assistant.conversation"
        ? "token-1"
        : key === "assistant.chats"
          ? JSON.stringify([{ token: "token-1", title: "AC not cooling" }])
          : null,
    );
    mockClient.POST.mockResolvedValue(reply({ ...created, conversation_token: "token-2" }));
    const screen = await renderScreen();

    fireEvent.press(await screen.findByLabelText("Chat history"));
    fireEvent.press(await screen.findByLabelText("Delete chat AC not cooling"));

    // Back on the assistant's page: the sheet is gone and a fresh conversation has started.
    await waitFor(() => expect(screen.queryByText("Chat history")).toBeNull());
    await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(1));

    fireEvent.press(await screen.findByLabelText("Chat history"));
    expect(await screen.findByText("No chats yet")).toBeTruthy();
    expect(screen.queryByText("Open now")).toBeNull();
  });

  it("offers each service category once as a starter chip and sends it as the first message", async () => {
    // The reply is still on its way, as it is for a few seconds in real life.
    const fetchMock = jest.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => undefined));
    mockClient.POST.mockResolvedValue(reply(created));
    const screen = await renderScreen();

    // The chips work once the conversation exists.
    await screen.findByText(GREETING, { exact: false });
    expect(await screen.findAllByText("AC Repair")).toHaveLength(1);
    expect(screen.getByText("Home Cleaning")).toBeTruthy();

    fireEvent.press(screen.getByText("AC Repair"));

    expect(await screen.findByText("I need AC Repair")).toBeTruthy();
    expect(screen.queryByText("How can I help you today?")).toBeNull();
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

    await screen.findByText(GREETING, { exact: false });
    expect(screen.getByText("How can I help you today?")).toBeTruthy();
    expect(screen.queryByText("AC Repair")).toBeNull();
    expect(screen.queryByText("Home Cleaning")).toBeNull();
  });

  it("starts a conversation and shows the assistant's greeting", async () => {
    mockClient.POST.mockResolvedValue(reply(created));
    const screen = await renderScreen();

    expect(await screen.findByText(GREETING, { exact: false })).toBeTruthy();
    expect(screen.getByText("Booking assistant")).toBeTruthy();
    // A new chat opens with the welcome until the customer says something.
    expect(screen.getByText("How can I help you today?")).toBeTruthy();
  });

  it("shows the server's error and starts again when the person taps Try again", async () => {
    mockClient.POST.mockResolvedValueOnce(failure(503)).mockResolvedValueOnce(reply(created));
    const screen = await renderScreen();

    fireEvent.press(await screen.findByText("Try again"));

    await waitFor(() => expect(mockClient.POST).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(GREETING, { exact: false })).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
  });
});
