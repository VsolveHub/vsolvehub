import { Card } from "@vsolve/ui";

// Streams instantly on navigation between onboarding steps so the user sees a
// skeleton rather than a blank/frozen page while the server renders the step.
export default function OnboardingLoading() {
  return (
    <Card className="p-5 sm:p-8">
      <div className="mx-auto h-6 w-52 animate-pulse rounded bg-gray-200" />
      <div className="mx-auto mt-2 h-4 w-64 animate-pulse rounded bg-gray-100" />
      <div className="my-7 h-2 w-full animate-pulse rounded-full bg-gray-100" />
      <div className="space-y-4">
        <div className="h-12 w-full animate-pulse rounded-lg bg-gray-100" />
        <div className="h-12 w-full animate-pulse rounded-lg bg-gray-100" />
        <div className="h-28 w-full animate-pulse rounded-xl bg-gray-100" />
        <div className="ml-auto h-11 w-40 animate-pulse rounded-lg bg-gray-200" />
      </div>
    </Card>
  );
}
