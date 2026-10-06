type Listener = () => void;
const listeners = new Set<Listener>();

export function requestOpenNotifications() {
  for (const listener of listeners) listener();
}

export function subscribeOpenNotifications(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
