import { buyPass, passPurchaseScope } from "./queries";

const mockRequest = jest.fn();
const mockClear = jest.fn();
const mockKey = jest.fn((scope: string) => `key-for-${scope}`);
let mockHeaders: unknown[] = [];

class MockApiError extends Error {
  constructor(readonly retryable: boolean) {
    super("refused");
  }
}

jest.mock("@vsolve/api-client", () => ({
  request: (call: () => unknown) => mockRequest(call),
  getStableIdempotencyKey: (scope: string) => mockKey(scope),
  clearIdempotencyKey: (scope: string) => mockClear(scope),
  isApiRequestError: (error: unknown) => error instanceof MockApiError,
}));
jest.mock("@vsolve/mobile-core", () => ({
  getApiClient: () => ({
    POST: (_path: string, init: { params: { header: unknown } }) => {
      mockHeaders.push(init.params.header);
      return init;
    },
  }),
}));

beforeEach(() => {
  mockRequest.mockReset();
  mockClear.mockReset();
  mockHeaders = [];
});

test("sends one idempotency key per plan, and lets it go once the purchase is made", async () => {
  mockRequest.mockImplementation(async (call: () => unknown) => {
    call();
    return { id: "pass", payment_attempt_id: null };
  });

  await buyPass("plan-1");

  expect(mockHeaders).toEqual([{ "Idempotency-Key": "key-for-rides.pass.plan-1" }]);
  expect(mockClear).toHaveBeenCalledWith(passPurchaseScope("plan-1"));
});

test("keeps the key after a network failure, so the retry is the same purchase", async () => {
  mockRequest.mockRejectedValue(new TypeError("Network request failed"));

  await expect(buyPass("plan-1")).rejects.toThrow("Network request failed");
  expect(mockClear).not.toHaveBeenCalled();
});

test("lets the key go after a final refusal, so the next tap is a new purchase", async () => {
  mockRequest.mockRejectedValue(new MockApiError(false));

  await expect(buyPass("plan-1")).rejects.toThrow("refused");
  expect(mockClear).toHaveBeenCalledWith("rides.pass.plan-1");
});
