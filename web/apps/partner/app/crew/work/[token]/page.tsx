import { AlertCircle } from "lucide-react";
import { Logo } from "@vsolve/ui";
import { getMemberWork } from "@/lib/crew-clock";
import { WorkClient } from "./work-client";

export const metadata = { title: "My work", robots: { index: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center bg-surface-muted px-4 py-8">
      <div className="mb-6">
        <Logo />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

export default async function MemberWorkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const work = await getMemberWork(token);

  if (!work) {
    return (
      <Shell>
        <div className="rounded-3xl border border-border bg-white p-6 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-danger">
            <AlertCircle className="h-7 w-7" />
          </span>
          <h1 className="text-lg font-bold text-ink-900">Link not valid</h1>
          <p className="mt-1 text-sm text-gray-500">Ask your crew lead to share your work link again.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <WorkClient token={token} name={work.member.name} crewName={work.crew.name} jobs={work.jobs} />
    </Shell>
  );
}
