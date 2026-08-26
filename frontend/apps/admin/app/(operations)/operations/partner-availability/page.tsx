import { AvailabilityEditor } from "@/features/partner-availability/view/availability-editor";

/**
 * Partner availability, changed on the Partner's behalf.
 *
 * The last resort, not the normal path: Partners set their own hours in their
 * own app, where they can see what those hours currently are. This exists for
 * the cases where they cannot — a lost device, an account being recovered, a
 * Partner on the phone — and the screen is written to keep it that way.
 */
export default function PartnerAvailabilityPage() {
  return (
    <>

      <div className="mt-6 max-w-4xl">
        <AvailabilityEditor />
      </div>
    </>
  );
}
