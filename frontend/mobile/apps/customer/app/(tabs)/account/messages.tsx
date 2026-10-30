import { MessagesScreen } from "@/features/account/view/messages-screen";
import { AccountHome } from "@/features/account/view/account-home";
import { useIsDesktop } from "@/lib/responsive";

export default function Screen() {
  const isDesktop = useIsDesktop();
  if (isDesktop) {
    return <AccountHome initialSection="messages" />;
  }
  return <MessagesScreen />;
}
