import { getApiClient } from "./api/client";
import { useAuthStore } from "./auth/auth-store";
import { mapLocationError, PERMISSION_DENIED, TIMEOUT } from "./location/errors";
import { razorpayCheckoutHtml, shouldOpenPaymentUrlExternally } from "./payments/checkout-html";
import { routePushData } from "./push/routing";
import { uploadToSignedUrl } from "./upload/upload";
import { compareVersions } from "./version/compare";

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
  it("reports progress and resolves on a successful PUT", async () => {
    const progress: number[] = [];
    class FakeXhr {
      upload = { onprogress: (_event: ProgressEvent) => undefined };
      status = 200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      send() {
        this.upload.onprogress({ lengthComputable: true, loaded: 1, total: 2 } as ProgressEvent);
        this.onload?.();
      }
    }
    const Original = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
    globalThis.fetch = jest.fn(async () => ({
      blob: async () => new Blob(["hi"]),
    })) as unknown as typeof fetch;
    await uploadToSignedUrl({
      uri: "file://photo.jpg",
      contentType: "image/jpeg",
      url: "https://uploads.example/photo",
      onProgress: (fraction) => progress.push(fraction),
    });
    expect(progress).toEqual([0.5]);
    globalThis.XMLHttpRequest = Original;
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
