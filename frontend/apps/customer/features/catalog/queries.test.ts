import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { fixtures } from "@vsolve/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getCategories, getCategory, getCategoryServices, getService } from "./queries";

/**
 * Catalog data layer.
 *
 * The property under test is the one the pages depend on for honesty: an empty
 * catalogue and an unreachable catalogue must be distinguishable.
 *
 *   empty       -> resolves normally, the page renders an EmptyState
 *   not found   -> resolves to null, the page calls notFound()
 *   unreachable -> throws, the failure reaches error.tsx and is not cached
 *
 * Collapsing the third case into the first is how a customer gets told Vsolve
 * Hub offers no services when the API was simply down.
 */

const API = "http://localhost:8000";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("getCategories", () => {
  it("returns contract-typed categories", async () => {
    server.use(
      http.get(`${API}/api/v1/categories/`, () => HttpResponse.json([fixtures.category()])),
    );

    const categories = await getCategories();
    expect(categories).toHaveLength(1);
    expect(categories[0]?.slug).toBe("technician");
  });

  it("returns an empty list as an empty list, not an error", async () => {
    // A published-but-empty catalogue is a real state. The page shows an
    // EmptyState for it; it must not look like a failure.
    server.use(http.get(`${API}/api/v1/categories/`, () => HttpResponse.json([])));

    await expect(getCategories()).resolves.toEqual([]);
  });

  it("retries a refused connection then returns categories", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/api/v1/categories/`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.error();
        return HttpResponse.json([fixtures.category()]);
      }),
    );

    const categories = await getCategories();
    expect(categories).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it("throws when the API is unreachable, so error.tsx handles it", async () => {
    server.use(http.get(`${API}/api/v1/categories/`, () => HttpResponse.error()));

    await expect(getCategories()).rejects.toThrow();
  });

  it("throws on a server error rather than degrading to an empty catalogue", async () => {
    server.use(
      http.get(`${API}/api/v1/categories/`, () =>
        HttpResponse.json(fixtures.apiError("INTERNAL", "Something failed."), { status: 500 }),
      ),
    );

    await expect(getCategories()).rejects.toThrow();
  });
});

describe("getCategoryServices", () => {
  it("returns the services for a category", async () => {
    server.use(
      http.get(`${API}/api/v1/categories/technician/services/`, () =>
        HttpResponse.json([fixtures.serviceCard()]),
      ),
    );

    const services = await getCategoryServices("technician");
    expect(services?.[0]?.name).toBe("Switch / Socket Repair");
  });

  it("returns null for an unknown category so the page can 404", async () => {
    server.use(
      http.get(`${API}/api/v1/categories/nope/services/`, () =>
        HttpResponse.json(fixtures.apiError("NOT_FOUND", "No such category."), { status: 404 }),
      ),
    );

    await expect(getCategoryServices("nope")).resolves.toBeNull();
  });

  it("distinguishes an empty category from a missing one", async () => {
    // Empty resolves to []; missing resolves to null. The page renders an
    // EmptyState for the first and a 404 for the second.
    server.use(
      http.get(`${API}/api/v1/categories/technician/services/`, () => HttpResponse.json([])),
    );

    await expect(getCategoryServices("technician")).resolves.toEqual([]);
  });

  it("throws on a server error rather than reporting an empty category", async () => {
    server.use(
      http.get(`${API}/api/v1/categories/technician/services/`, () =>
        HttpResponse.json(fixtures.apiError("INTERNAL", "Boom."), { status: 500 }),
      ),
    );

    await expect(getCategoryServices("technician")).rejects.toThrow();
  });
});

describe("getService", () => {
  it("returns the service detail", async () => {
    server.use(
      http.get(`${API}/api/v1/services/switch-socket-repair/`, () =>
        HttpResponse.json({
          ...fixtures.serviceCard(),
          description: "Full description.",
          variants: [],
          policies: [],
          media: [],
        }),
      ),
    );

    const service = await getService("switch-socket-repair");
    expect(service?.starting_price?.amount_paise).toBe(19900);
  });

  it("returns null for an unknown slug", async () => {
    server.use(
      http.get(`${API}/api/v1/services/nope/`, () =>
        HttpResponse.json(fixtures.apiError("NOT_FOUND", "No such service."), { status: 404 }),
      ),
    );

    await expect(getService("nope")).resolves.toBeNull();
  });
});

describe("getCategory", () => {
  it("resolves a category from the cached list rather than a second request", async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/api/v1/categories/`, () => {
        calls += 1;
        return HttpResponse.json([fixtures.category()]);
      }),
    );

    const category = await getCategory("technician");
    expect(category?.name).toBe("Technician");
    expect(calls).toBe(1);
  });

  it("returns null for a slug that is not in the catalogue", async () => {
    server.use(
      http.get(`${API}/api/v1/categories/`, () => HttpResponse.json([fixtures.category()])),
    );

    await expect(getCategory("does-not-exist")).resolves.toBeNull();
  });
});
