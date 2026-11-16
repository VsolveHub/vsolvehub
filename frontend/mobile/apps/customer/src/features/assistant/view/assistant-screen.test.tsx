import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { AssistantScreen } from "./assistant-screen";

const mockClient = { GET: jest.fn(), POST: jest.fn() };

jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => mockClient,
  apiBaseUrl: () => "http://localhost:8000",
}));

jest.mock("@vsolve/mobile-core/storage", () => ({
  kvGet: jest.fn(async () => null),
  kvSet: jest.fn(async () => undefined),
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
    mockClient.GET.mockResolvedValue(reply(created.conversation, 200));
  });

  it("starts a conversation and shows the assistant's greeting", async () => {
    mockClient.POST.mockResolvedValue(reply(created));
    const screen = await renderScreen();

    expect(await screen.findByText(GREETING, { exact: false })).toBeTruthy();
    expect(screen.getByText("Booking assistant")).toBeTruthy();
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
