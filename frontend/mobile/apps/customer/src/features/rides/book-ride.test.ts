import { bookRide } from "./queries";

const mockRequest = jest.fn();
const mockClear = jest.fn();
const mockKeys: unknown[] = [];

class MockApiError extends Error {
  constructor(readonly retryable: boolean) {
    super("refused");
  }
}

jest.mock("@vsolve/api-client", () => ({
  request: (call: () => unknown) => mockRequest(call),
  getStableIdempotencyKey: (scope: string) => `key-for-${scope}`,
  clearIdempotencyKey: (scope: string) => mockClear(scope),
  isApiRequestError: (error: unknown) => error instanceof MockApiError,
}));
jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => ({
    POST: (_path: string, init: { params: { header: Record<string, string> } }) => {
      mockKeys.push(init.params.header["Idempotency-Key"]);
      return init;
    },
  }),
}));

beforeEach(() => {
  mockRequest.mockReset().mockImplementation(async (call: () => unknown) => {
    call();
    throw new TypeError("Network request failed");
  });
  mockClear.mockReset();
  mockKeys.length = 0;
});

test("a retry after a network failure sends the same key, so the ride is booked once", async () => {
  await expect(bookRide("quote-1")).rejects.toThrow("Network request failed");
  await expect(bookRide("quote-1")).rejects.toThrow("Network request failed");

  expect(mockKeys).toEqual(["key-for-rides.book.quote-1", "key-for-rides.book.quote-1"]);
  expect(mockClear).not.toHaveBeenCalled();
});

test("the key goes once the ride is booked, or the booking is refused", async () => {
  mockRequest.mockImplementationOnce(async () => ({ id: "ride-1" }));
  await bookRide("quote-1");
  expect(mockClear).toHaveBeenCalledWith("rides.book.quote-1");

  mockRequest.mockRejectedValueOnce(new MockApiError(false));
  await expect(bookRide("quote-2")).rejects.toThrow("refused");
  expect(mockClear).toHaveBeenCalledWith("rides.book.quote-2");
});
