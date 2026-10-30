"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@vsolve/api-client";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";

export type OpsSafetyStory = Schemas["OpsSafetyStory"];

const STORIES_QUERY_KEY = ["operations", "safety-stories"] as const;

export async function fetchOpsStories(status = "all"): Promise<OpsSafetyStory[]> {
  const url = `${PUBLIC_API_BASE_URL}/api/v1/ops/stories/?status=${encodeURIComponent(status)}`;
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch stories: ${res.statusText}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

let cachedCsrfToken: string | null = null;

async function getCsrfToken(forceRefresh = false): Promise<string | null> {
  if (cachedCsrfToken && !forceRefresh) {
    return cachedCsrfToken;
  }
  try {
    const res = await fetch(`${PUBLIC_API_BASE_URL}/api/v1/auth/csrf/`, {
      method: "GET",
      credentials: "include",
    });
    if (res.ok) {
      const data = (await res.json()) as { csrf_token?: string };
      if (data.csrf_token) {
        cachedCsrfToken = data.csrf_token;
        return data.csrf_token;
      }
    }
  } catch {
    // ignore
  }
  return cachedCsrfToken;
}

export async function createOpsStory(formData: FormData): Promise<OpsSafetyStory> {
  const url = `${PUBLIC_API_BASE_URL}/api/v1/ops/stories/`;
  let token = await getCsrfToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) {
    headers["X-CSRFToken"] = token;
  }

  let res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers,
    body: formData,
  });

  // If CSRF token is expired or rotated, retry once with a fresh token
  if (res.status === 403) {
    token = await getCsrfToken(true);
    if (token) {
      headers["X-CSRFToken"] = token;
      res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers,
        body: formData,
      });
    }
  }

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as Record<string, any>;
    const message =
      errorData?.error?.message ||
      errorData?.details?.message ||
      errorData?.detail ||
      errorData?.file ||
      res.statusText ||
      "Failed to upload safety story";
    throw new Error(String(message));
  }

  return res.json();
}

export async function updateOpsStory(
  id: string,
  payload: { title?: string; caption?: string; display_order?: number; is_published?: boolean },
): Promise<OpsSafetyStory> {
  const url = `${PUBLIC_API_BASE_URL}/api/v1/ops/stories/${encodeURIComponent(id)}/`;
  let token = await getCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers["X-CSRFToken"] = token;
  }

  let res = await fetch(url, {
    method: "PATCH",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  });

  if (res.status === 403) {
    token = await getCsrfToken(true);
    if (token) {
      headers["X-CSRFToken"] = token;
      res = await fetch(url, {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify(payload),
      });
    }
  }

  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as Record<string, any>;
    const message =
      errorData?.error?.message ||
      errorData?.details?.message ||
      errorData?.detail ||
      "Failed to update story";
    throw new Error(String(message));
  }

  return res.json();
}

export async function deleteOpsStory(id: string): Promise<void> {
  const url = `${PUBLIC_API_BASE_URL}/api/v1/ops/stories/${encodeURIComponent(id)}/`;
  let token = await getCsrfToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["X-CSRFToken"] = token;
  }

  let res = await fetch(url, {
    method: "DELETE",
    credentials: "include",
    headers,
  });

  if (res.status === 403) {
    token = await getCsrfToken(true);
    if (token) {
      headers["X-CSRFToken"] = token;
      res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
        headers,
      });
    }
  }

  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete story: ${res.statusText}`);
  }
}

export function useOpsStories(status = "all") {
  return useQuery({
    queryKey: [...STORIES_QUERY_KEY, status],
    queryFn: () => fetchOpsStories(status),
    staleTime: 10_000,
  });
}

export function useCreateOpsStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => createOpsStory(formData),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STORIES_QUERY_KEY });
    },
  });
}

export function useUpdateOpsStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { title?: string; caption?: string; display_order?: number; is_published?: boolean };
    }) => updateOpsStory(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STORIES_QUERY_KEY });
    },
  });
}

export function useDeleteOpsStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOpsStory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STORIES_QUERY_KEY });
    },
  });
}
