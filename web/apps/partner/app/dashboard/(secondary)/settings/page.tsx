import { LogOut } from "lucide-react";
import { Button, Card } from "@vsolve/ui";
import { requirePartner } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { logout } from "@/app/dashboard/_live/actions";
import { ProfileForm } from "./profile-form";

export default async function SettingsPage() {
  const partner = await requirePartner();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Manage your profile and account." />

      <Card>
        <h2 className="mb-4 font-semibold text-ink-900">Profile</h2>
        <ProfileForm fullName={partner.fullName} />
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-ink-900">Account</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Mobile number</dt>
            <dd className="mt-1 font-medium text-ink-900">{partner.phone}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Role</dt>
            <dd className="mt-1 font-medium text-ink-900">{partner.providerType}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Service</dt>
            <dd className="mt-1 font-medium text-ink-900">{partner.trade?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Status</dt>
            <dd className="mt-1 font-medium text-ink-900">{partner.status}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="font-semibold text-ink-900">Sign out</h2>
        <p className="mt-1 text-sm text-gray-500">Sign out of the partner portal on this device.</p>
        <form action={logout} className="mt-4">
          <Button type="submit" variant="outline">
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </form>
      </Card>
    </div>
  );
}
