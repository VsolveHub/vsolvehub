type BackHandler = () => boolean | void;

let currentCustomBackHandler: BackHandler | null = null;

export function setFocusedBackHandler(handler: BackHandler | null): void {
  currentCustomBackHandler = handler;
}

export function handleFocusedBack(defaultBack: () => void): void {
  if (currentCustomBackHandler) {
    const handled = currentCustomBackHandler();
    if (handled !== false) {
      return;
    }
  }
  defaultBack();
}
