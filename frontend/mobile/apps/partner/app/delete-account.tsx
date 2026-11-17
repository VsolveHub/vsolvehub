import { DeleteAccountScreen } from "@/features/account/delete-account-screen";

/**
 * Outside `(app)`, like `/help`: an applicant who is not an approved Partner yet can still ask
 * for their account to be deleted. Under `/me` the partner guard would send them straight back to
 * their application. The request itself only needs a signed-in account.
 */
export default function DeleteAccountRoute() {
  return <DeleteAccountScreen />;
}
