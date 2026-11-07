import { DocumentsScreen } from "@/features/account/view/documents-screen";
import { AccountHome } from "@/features/account/view/account-home";
import { useIsDesktop } from "@/lib/responsive";

export default function Screen() {
  const isDesktop = useIsDesktop();
  if (isDesktop) {
    return <AccountHome initialSection="documents" />;
  }
  return <DocumentsScreen />;
}
