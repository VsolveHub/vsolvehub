import Link from "next/link";
import { Users, CheckCircle2, AlertCircle } from "lucide-react";
import { prisma } from "@vsolve/db";
import { Logo } from "@vsolve/ui";
import { roleLabel } from "@/lib/crew-constants";
import { JoinForm } from "./join-form";

export const metadata = { title: "Join your crew", robots: { index: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <div className="w-full max-w-sm rounded-3xl border border-border bg-white p-6 shadow-sm">{children}</div>
    </main>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const member = await prisma.crewMember.findUnique({
    where: { inviteToken: token },
    include: { crew: { select: { name: true } } },
  });

  if (!member || member.status === "REMOVED") {
    return (
      <Shell>
        <div className="text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-danger">
            <AlertCircle className="h-7 w-7" />
          </span>
          <h1 className="text-lg font-bold text-ink-900">Invite not valid</h1>
          <p className="mt-1 text-sm text-gray-500">
            This link has expired or was reset. Please ask your crew lead to share a new one.
          </p>
        </div>
      </Shell>
    );
  }

  if (member.status === "ACTIVE") {
    return (
      <Shell>
        <div className="text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h1 className="text-lg font-bold text-ink-900">You're all set, {member.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-gray-500">
            You're part of <span className="font-semibold text-ink-900">{member.crew.name}</span> as{" "}
            {roleLabel(member.role)}.
          </p>
          <Link
            href={`/crew/work/${token}`}
            className="mt-4 inline-block rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Go to my work
          </Link>
          <p className="mt-2 text-[11px] text-gray-400">Bookmark this — it's where you clock in for jobs.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-5 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600">
          <Users className="h-7 w-7" />
        </span>
        <h1 className="text-lg font-bold text-ink-900">Join {member.crew.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          You've been added as <span className="font-semibold text-ink-900">{roleLabel(member.role)}</span>. Confirm
          to join the crew.
        </p>
      </div>
      <JoinForm token={token} defaultName={member.name} />
    </Shell>
  );
}
