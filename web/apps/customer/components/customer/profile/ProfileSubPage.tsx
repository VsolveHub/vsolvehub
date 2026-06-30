import Link from "next/link";

type Props = {
  title: string;
  children: React.ReactNode;
};

export function ProfileSubPage({ title, children }: Props) {
  return (
    <div className="profile-subpage">
      <div className="profile-subpage-header">
        <Link href="/profile" className="profile-back-link">
          ← Account
        </Link>
        <h1 className="profile-subpage-title">{title}</h1>
      </div>
      {children}
    </div>
  );
}
