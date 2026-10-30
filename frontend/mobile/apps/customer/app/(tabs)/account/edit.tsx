import { ProfileEditor } from "@/features/account/view/profile-editor";
import { AccountHome } from "@/features/account/view/account-home";
import { useIsDesktop } from "@/lib/responsive";

export default function Screen() {
  const isDesktop = useIsDesktop();
  if (isDesktop) {
    return <AccountHome initialSection="profile" />;
  }
  return <ProfileEditor />;
}
