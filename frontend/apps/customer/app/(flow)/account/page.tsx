import { redirect } from "next/navigation";

/**
 * `/account` has no content of its own.
 *
 * A landing page here would be a menu duplicating the nav that is already on
 * screen, and it would put an extra tap between someone and the reason they came
 * — which is almost always an address. `replace` semantics: the redirect must
 * not become a history entry that a back press bounces off.
 */
export default function AccountPage() {
  redirect("/account/addresses");
}
