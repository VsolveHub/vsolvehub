// Central query keys + fetch helper for the partner portal's live surfaces.
// Response shapes stay with their components; this just removes duplicated
// inline fetch plumbing and keeps query keys consistent for invalidation.

export const pqk = {
  jobOffers: () => ["job-offers"] as const,
  crewRequests: () => ["crew-requests"] as const,
};

export async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = "Request failed";
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      /* non-JSON error */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}
