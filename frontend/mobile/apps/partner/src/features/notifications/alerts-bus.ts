const listeners = new Set<() => void>();

export function requestOpenAlerts(): void {
  for (const listener of listeners) listener();
}

export function subscribeOpenAlerts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
