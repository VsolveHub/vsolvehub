import { act, render } from "@testing-library/react-native";

import { NewRequestScreen } from "./new-request-screen";

const mockCreate = jest.fn();
const mockPush = jest.fn();

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock("@/features/addresses/queries", () => ({
  useAddresses: () => ({ data: [] }),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockPush, push: mockPush }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/features/catalog/client-queries", () => ({
  useServiceDetail: () => ({
    isPending: false,
    data: { name: "Painting", bookable_variant_id: "variant-1", requirement_variants: [] },
  }),
}));

jest.mock("@/features/requirement/queries", () => ({
  useCreateRequirement: () => ({ mutate: mockCreate, isPending: false, error: null }),
  useSaveRequirement: () => ({ mutate: jest.fn(), isPending: false, error: null }),
  useSubmitRequirement: () => ({ mutate: jest.fn(), isPending: false, error: null }),
}));

function tap(element: { props: { onClick?: (event: object) => void } }) {
  element.props.onClick?.({
    nativeEvent: {},
    currentTarget: 1,
    target: 1,
    stopPropagation() {},
  });
}

test("new request sends the typed details", async () => {
  const view = await render(<NewRequestScreen serviceSlug="painting" />);
  expect(view.getByText("Painting")).toBeTruthy();
  const input = view.getByPlaceholderText("What needs doing");
  await act(async () => {
    input.props.onChangeText("Two rooms");
  });
  tap(await view.findByRole("button", { name: "Send request" }));
  expect(mockCreate).toHaveBeenCalledWith(
    { variantId: "variant-1", answers: { details: "Two rooms" }, language: "en" },
    expect.any(Object),
  );
});
