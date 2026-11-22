// The keyboard handling used by the apply screens (app/(app)/apply/_layout.tsx), for a screen that
// owns its own ScrollView. On Android the keyboard does not resize the screen, so it covers
// whatever is behind it. While it is open this gives the page empty space as tall as the keyboard,
// and scrolls the field being typed in to sit just above it.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import { Keyboard, Platform, ScrollView, TextInput } from "react-native";

const KEYBOARD_GAP = 56;

const ScrollFieldContext = createContext<() => void>(() => undefined);

/** Called from a field's `onFocus`, so moving between fields with the keyboard open keeps up. */
export const useScrollFieldIntoView = () => useContext(ScrollFieldContext);
export const ScrollFieldProvider = ScrollFieldContext.Provider;

export function useKeyboardScroll() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardTop = useRef<number | null>(null);
  const scrollOffset = useRef(0);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const scrollFieldIntoView = useCallback(() => {
    // Runs twice: once as the keyboard opens, and again once the extra space under the page is in
    // place (the first scroll can be clamped to the old, shorter page).
    const align = () => {
      const field = TextInput.State.currentlyFocusedInput();
      const top = keyboardTop.current;
      if (!field || top === null) return;
      field.measureInWindow((_x, y, _width, height) => {
        const hidden = y + height + KEYBOARD_GAP - top;
        if (hidden > 0) scrollRef.current?.scrollTo({ y: scrollOffset.current + hidden, animated: true });
      });
    };
    setTimeout(align, 250);
    setTimeout(align, 700);
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      setKeyboardHeight(event.endCoordinates.height);
      scrollFieldIntoView();
    });
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => {
      keyboardTop.current = null;
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [scrollFieldIntoView]);

  return {
    scrollRef,
    keyboardHeight,
    keyboardOpen: keyboardHeight > 0,
    keyboardGap: KEYBOARD_GAP,
    scrollFieldIntoView,
    onScroll: (offsetY: number) => {
      scrollOffset.current = offsetY;
    },
  };
}
