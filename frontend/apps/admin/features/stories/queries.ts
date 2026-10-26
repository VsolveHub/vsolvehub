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

export async function createOpsStory(formData: FormData): Promise<OpsSafetyStory> {
  const url = `${PUBLIC_API_BASE_URL}/api/v1/ops/stories/`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message =
      (errorData as Record<string, unknown>).detail ||
      (errorData as Record<string, unknown>).file ||
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
  const res = await fetch(url, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error((errorData as Record<string, unknown>).detail?.toString() || "Failed to update story");
  }

  return res.json();
}

export async function deleteOpsStory(id: string): Promise<void> {
  const url = `${PUBLIC_API_BASE_URL}/api/v1/ops/stories/${encodeURIComponent(id)}/`;
  const res = await fetch(url, {
    method: "DELETE",
    credentials: "include",
  });

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
