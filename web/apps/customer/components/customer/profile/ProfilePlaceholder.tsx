import Link from "next/link";
import { ProfileSubPage } from "@/components/customer/profile/ProfileSubPage";
import { EmptyState } from "@/components/ui/primitives";

type Props = {
  title: string;
  description?: string;
};

export function ProfilePlaceholder({ title, description }: Props) {
  return (
    <ProfileSubPage title={title}>
      <EmptyState
        description={description ?? "This section is coming soon."}
        action={
          <Link
            href="/services"
            className="inline-flex items-center justify-center rounded-[10px] bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-900"
          >
            Browse services
          </Link>
        }
      />
    </ProfileSubPage>
  );
}
