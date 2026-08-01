import { Spinner } from "@vsolve/ui";

export default function RootLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <Spinner size="lg" />
    </div>
  );
}
