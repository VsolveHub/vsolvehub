type BadgeProps = {
  status: string;
  children: React.ReactNode;
};

export function Badge({ status, children }: BadgeProps) {
  const normalized = status.toLowerCase();
  return <span className={`badge badge-${normalized}`}>{children}</span>;
}
