import Link from "next/link";
import { ProfileSubPage } from "@/components/customer/profile/ProfileSubPage";

type Props = {
  title: string;
  description?: string;
};

export function ProfilePlaceholder({ title, description }: Props) {
  return (
    <ProfileSubPage title={title}>
      <div className="profile-placeholder">
        <p>{description ?? "This section is coming soon."}</p>
        <Link href="/services" className="btn btn-primary">
          Browse services
        </Link>
      </div>
    </ProfileSubPage>
  );
}
