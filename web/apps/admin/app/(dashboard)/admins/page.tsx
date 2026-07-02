import { prisma } from "@vsolve/db";
import { Badge, Card } from "@vsolve/ui";
import { requireAdmin } from "@/lib/auth";
import { AddAdminForm } from "./add-admin-form";
import { RemoveAdminButton } from "./remove-admin-button";

export const metadata = { title: "Admins" };

export default async function AdminsPage() {
  const me = await requireAdmin({ role: "ADMIN" });
  const admins = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-ink-900">Admins</h1>
      <p className="mt-1 text-sm text-gray-500">
        Only allowlisted emails can sign in. Admins can manage other admins; reviewers can only review partners.
      </p>

      <Card className="mt-6">
        <AddAdminForm />
      </Card>

      <Card className="mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-border bg-surface-muted text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Added</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                <td className="px-5 py-3 font-medium text-ink-900">
                  {a.email}
                  {a.id === me.id ? <span className="ml-2 text-xs font-normal text-gray-400">(you)</span> : null}
                </td>
                <td className="px-5 py-3">
                  <Badge tone={a.role === "ADMIN" ? "brand" : "neutral"}>{a.role}</Badge>
                </td>
                <td className="px-5 py-3 text-gray-500">{a.createdAt.toLocaleDateString("en-IN")}</td>
                <td className="px-5 py-3">
                  {a.id === me.id ? null : <RemoveAdminButton id={a.id} email={a.email} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
