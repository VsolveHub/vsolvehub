"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";

import { JobProfileForm } from "@/features/listings/view";
import { useCustomerSession } from "@/features/session/queries";
import { SignInCard } from "@/features/session/view/sign-in-gate";

function ProfilePage() {
  const session = useCustomerSession();
  const params = useSearchParams();
  const back = params?.get("back") ?? undefined;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <Link href="/listings" className="inline-flex items-center gap-1.5 text-xs font-bold text-text-secondary">
        <ArrowLeft className="size-3.5" /> Jobs
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold text-navy-900">Your job profile</h1>
        <p className="text-sm text-text-secondary">Fill it once. Matching jobs find you, and you apply in one tap.</p>
      </div>
      {session.isAuthenticated ? (
        <JobProfileForm defaultName={session.fullName || ""} returnTo={back} />
      ) : (
        <SignInCard
          title="Sign in to create your job profile"
          message="Fill it once, and matching jobs find you. Sign in with your phone number first."
        />
      )}
    </main>
  );
}

/** `/listings/profile` — the job seeker's tap-to-fill profile. */
export default function JobProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePage />
    </Suspense>
  );
}
