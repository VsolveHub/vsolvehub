import Link from "next/link";

export function Header() {
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link href="/" className="logo">
          VSolveHub
        </Link>
        <nav className="nav-links">
          <Link href="/services" className="nav-link">
            Services
          </Link>
          <Link href="/profile" className="nav-link">
            Profile
          </Link>
        </nav>
      </div>
    </header>
  );
}
