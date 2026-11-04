import { getApiClient } from "./api/client";
import { useAuthStore } from "./auth/auth-store";
import { mapLocationError, PERMISSION_DENIED, TIMEOUT } from "./location/errors";
import { razorpayCheckoutHtml, shouldOpenPaymentUrlExternally } from "./payments/checkout-html";
import { routePushData } from "./push/routing";
import { describeLocalFile, LocalFileUnreadableError, uploadToSignedUrl } from "./upload/upload";
import { compareVersions } from "./version/compare";

// The phone upload reads files through expo-file-system. Names start with `mock` because jest
// hoists jest.mock above the imports and only lets the factory see such names.
const mockFiles = new Map<string, number>();
const mockUploads: { url: string; method?: string; headers?: Record<string, string> }[] = [];
const mockUploadStatus = { value: 200 };

jest.mock("expo-file-system", () => ({
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  File: class {
    constructor(private readonly mockUri: string) {}
    get exists() {
      return mockFiles.has(this.mockUri);
    }
    get size() {
      return mockFiles.get(this.mockUri) ?? 0;
    }
    async digest() {
      return "a".repeat(64);
    }
    async upload(
      url: string,
      options: {
        httpMethod?: string;
        headers?: Record<string, string>;
        onProgress?: (data: { bytesSent: number; totalBytes: number }) => void;
      },
    ) {
      mockUploads.push({ url, method: options.httpMethod, headers: options.headers });
      options.onProgress?.({ bytesSent: 1, totalBytes: 2 });
      return { status: mockUploadStatus.value, body: "", headers: {} };
    }
  },
}));

jest.mock("./auth/token-store", () => {
  let value: string | null = null;
  return {
    readSessionToken: async () => value,
    writeSessionToken: async (token: string) => {
      value = token;
    },
    deleteSessionToken: async () => {
      value = null;
    },
  };
});

const captured: { auth?: { mode: string; getToken: () => string | null } } = {};

jest.mock("@vsolve/api-client", () => ({
  createApiClient: (options: { auth: { mode: string; getToken: () => string | null } }) => {
    captured.auth = options.auth;
    return { GET: jest.fn(), POST: jest.fn() };
  },
}));

describe("auth store", () => {
  it("moves from signed out to signed in and back", async () => {
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().status).toBe("signedOut");
    await useAuthStore.getState().signIn("session-key");
    expect(useAuthStore.getState()).toMatchObject({ status: "signedIn", token: "session-key" });
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().token).toBe("session-key");
    await useAuthStore.getState().signOut();
    expect(useAuthStore.getState()).toMatchObject({ status: "signedOut", token: null });
  });
});

describe("bearer client", () => {
  it("asks the API client for bearer mode and reads the current token", async () => {
    await useAuthStore.getState().signIn("live-token");
    getApiClient();
    expect(captured.auth?.mode).toBe("bearer");
    expect(captured.auth?.getToken()).toBe("live-token");
  });
});

describe("push routing", () => {
  it("uses the app mapping and falls back when the target is unknown", () => {
    const resolve = (target: { kind: string; id: string }) =>
      target.kind === "PARTNER_OFFERS" ? "/work/offers" : null;
    expect(routePushData({ target: { kind: "PARTNER_OFFERS", id: "1" } }, resolve, "/alerts")).toBe(
      "/work/offers",
    );
    expect(routePushData({ target: null }, resolve, "/alerts")).toBe("/alerts");
    expect(routePushData({ target: { kind: "OTHER", id: "1" } }, resolve, "/alerts")).toBe("/alerts");
  });
});

describe("versions", () => {
  it("compares dotted numbers", () => {
    expect(compareVersions("1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.1.9", "1.2.0")).toBe(-1);
    expect(compareVersions("1.2.10", "1.2.2")).toBe(1);
  });
});

describe("uploads", () => {
  beforeEach(() => {
    mockFiles.clear();
    mockUploads.length = 0;
  });

  it("measures size and digest from the file on disk, not from fetch", async () => {
    mockFiles.set("file:///cache/%2540anonymous%252Fapp/ImagePicker/id.jpg", 96162);
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(
      describeLocalFile("file:///cache/%2540anonymous%252Fapp/ImagePicker/id.jpg"),
    ).resolves.toEqual({ sizeBytes: 96162, sha256: "a".repeat(64) });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a file that is no longer on disk instead of hashing an error body", async () => {
    await expect(describeLocalFile("file:///cache/gone.jpg")).rejects.toBeInstanceOf(
      LocalFileUnreadableError,
    );
  });

  it("PUTs the file natively, reports progress and resolves on a 2xx", async () => {
    mockFiles.set("file:///photo.jpg", 2);
    const progress: number[] = [];
    await uploadToSignedUrl({
      uri: "file:///photo.jpg",
      contentType: "image/jpeg",
      url: "https://uploads.example/photo",
      onProgress: (fraction) => progress.push(fraction),
    });
    expect(progress).toEqual([0.5]);
    expect(mockUploads).toEqual([
      {
        url: "https://uploads.example/photo",
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
      },
    ]);
  });

  it("rejects when storage answers with an error status", async () => {
    mockFiles.set("file:///photo.jpg", 2);
    mockUploadStatus.value = 403;
    await expect(
      uploadToSignedUrl({ uri: "file:///photo.jpg", contentType: "image/jpeg", url: "https://u" }),
    ).rejects.toThrow("status 403");
    mockUploadStatus.value = 200;
  });
});

describe("location errors", () => {
  it("maps permission and timeout onto the web codes", () => {
    expect(mapLocationError({ code: "PERMISSION_DENIED" }).code).toBe(PERMISSION_DENIED);
    expect(mapLocationError({ code: "TIMEOUT" }).code).toBe(TIMEOUT);
  });
});

describe("payments", () => {
  it("opens UPI schemes outside the webview and keeps checkout html free of a result", () => {
    expect(shouldOpenPaymentUrlExternally("upi://pay")).toBe(true);
    expect(shouldOpenPaymentUrlExternally("https://api.razorpay.com")).toBe(false);
    const html = razorpayCheckoutHtml({
      publicKey: "rzp",
      providerOrderId: "order_1",
      amountPaise: 100,
      currency: "INR",
    });
    expect(html).toContain('postMessage("paid")');
    expect(html).toContain("order_1");
  });
});
