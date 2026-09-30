"use client";

import { hasRole, useAuthGuard, useLogout, useOtpFlow, useSwitchRole } from "@vsolve/query";
import { Button, Card, ErrorState, Logo, OtpForm, Spinner } from "@vsolve/ui";
import { getApiClient } from "@/lib/api/browser";
import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, User, LogOut, Sun, Moon, Monitor } from "lucide-react";

type Theme = "light" | "dark" | "system";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const saved = localStorage.getItem("vsolve-theme") as Theme | null;
    if (saved) setThemeState(saved);
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("vsolve-theme", newTheme);
    
    if (newTheme === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    } else {
      document.documentElement.setAttribute("data-theme", newTheme);
    }
  };

  return { theme, setTheme };
}

const OPERATIONS_ROLE = "operations";

export function OperationsLogin() {
  const flow = useOtpFlow(getApiClient());

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md p-8">
        <Logo className="h-8 w-auto" />
        <h1 className="mt-6 text-2xl font-bold text-text">Operations</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Staff sign-in. Use the mobile number your access was granted to.
        </p>
        <div className="mt-6">
          <OtpForm
            {...flow}
            heading="Your mobile number"
            headingLevel={2}
            description="We will text you a code. There is no password."
            verifyLabel="Verify and continue"
          />
        </div>
      </Card>
    </main>
  );
}

export function SwitchToOperations() {
  const switchRole = useSwitchRole(getApiClient());
  const logout = useLogout(getApiClient());

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-bold text-text">Switch to Operations</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          You are signed in with a different role. Switch to Operations to use
          this console.
        </p>

        {switchRole.isError ? (
          <ErrorState
            inline
            className="mt-4"
            title="We could not switch your role"
            message="Nothing has changed. Try again, or sign in with the account that has Operations access."
          />
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            onClick={() => switchRole.mutate(OPERATIONS_ROLE)}
            loading={switchRole.isPending}
            loadingLabel="Switching"
          >
            Switch to Operations
          </Button>
          <Button variant="ghost" onClick={() => logout.mutate()}>
            Sign in as someone else
          </Button>
        </div>
      </Card>
    </main>
  );
}

export function NoOperationsAccess({ onSignOut }: { onSignOut: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-xl font-bold text-text">You do not have access</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          This console is limited to staff with Operations access. If you think
          that is wrong, ask your team lead — access is granted per account, not
          requested here.
        </p>
        <Button variant="outline" className="mt-6" onClick={onSignOut}>
          Sign out
        </Button>
      </Card>
    </main>
  );
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const guard = useAuthGuard(getApiClient(), {
    requiredRoles: [OPERATIONS_ROLE],
    requireActiveRole: true,
  });
  const logout = useLogout(getApiClient());

  if (guard.status === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 px-4 text-text-secondary">
        <Spinner size="sm" />
        Checking your access…
      </main>
    );
  }

  if (guard.status === "unauthenticated") return <OperationsLogin />;

  if (guard.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <ErrorState
            title="We could not check your access"
            message="Nothing has changed. Check your connection and try again."
            actionLabel="Try again"
            onAction={() => window.location.reload()}
          />
        </div>
      </main>
    );
  }

  if (guard.isSelectingRole) {
    return (
      <main className="flex min-h-screen items-center justify-center gap-2 px-4 text-text-secondary">
        <Spinner size="sm" />
        Opening your console…
      </main>
    );
  }

  if (guard.status === "forbidden") {
    return hasRole(guard.user, OPERATIONS_ROLE) ? (
      <SwitchToOperations />
    ) : (
      <NoOperationsAccess onSignOut={() => logout.mutate()} />
    );
  }

  return <>{children}</>;
}

export function UserMenu() {
  const guard = useAuthGuard(getApiClient(), {
    requiredRoles: [OPERATIONS_ROLE],
    requireActiveRole: true,
  });
  const logout = useLogout(getApiClient());
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  if (guard.status !== "authenticated") return null;

  const userDisplayName =
    guard.user.display_name || guard.user.full_name || "Operations User";

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-action rounded-md px-2 py-1"
      >
        <span className="hidden sm:inline">{userDisplayName}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-line rounded-card shadow-lg z-50 py-1 overflow-hidden">
            <Link
              href="/operations/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
            >
              <User className="h-4 w-4" />
              Profile
            </Link>

            <div className="border-t border-line my-1" />
            <div className="px-4 py-2 flex items-center justify-between text-sm text-text-secondary">
              <span className="flex items-center gap-2">
                {theme === 'light' ? <Sun className="h-4 w-4" /> : theme === 'dark' ? <Moon className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                Theme
              </span>
              <div className="flex bg-surface-hover rounded-md p-0.5">
                <button onClick={() => setTheme("light")} className={`p-1 rounded ${theme === 'light' ? 'bg-surface shadow-sm text-text' : 'text-text-secondary hover:text-text'}`} aria-label="Light theme">
                  <Sun className="h-3 w-3" />
                </button>
                <button onClick={() => setTheme("system")} className={`p-1 rounded ${theme === 'system' ? 'bg-surface shadow-sm text-text' : 'text-text-secondary hover:text-text'}`} aria-label="System theme">
                  <Monitor className="h-3 w-3" />
                </button>
                <button onClick={() => setTheme("dark")} className={`p-1 rounded ${theme === 'dark' ? 'bg-surface shadow-sm text-text' : 'text-text-secondary hover:text-text'}`} aria-label="Dark theme">
                  <Moon className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="border-t border-line my-1" />

            <button
              onClick={() => {
                setIsOpen(false);
                logout.mutate();
              }}
              disabled={logout.isPending}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text transition-colors text-left disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              {logout.isPending ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
