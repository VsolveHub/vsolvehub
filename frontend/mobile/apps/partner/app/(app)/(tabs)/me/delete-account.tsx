import { DeleteAccountScreen } from "@/features/account/delete-account-screen";

/** Inside the tabs shell, which draws the back bar, so the screen leaves out its own header. */
export default function Screen() {
  return <DeleteAccountScreen showHeader={false} />;
}
