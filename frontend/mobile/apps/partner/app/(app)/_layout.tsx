// Ported from frontend/apps/partner/features/session/partner-shell.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { getApiClient, useAuthStore, useMobileLogout } from "@vsolve/mobile-core";
import { hasRole, useAuthGuard, useCurrentSession, useSwitchRole } from "@vsolve/query/native";
import { Slot, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform, useWindowDimensions } from "react-native";

import { usePartnerApplication } from "@/features/application/queries";
import { LiveOfferSheet } from "@/features/crew-offer/view/live-offer-sheet";
import { PartnerPresenceProvider } from "@/features/presence/view/partner-presence-provider";
import { PARTNER_ROLE, getPartnerChromeMode, routeRequiresPartnerRole } from "@/features/session/chrome";
import { homeForApplication } from "@/features/session/model/redirect";
import { PartnerGuardView, type GuardBranch } from "@/features/session/partner-guard";
import { DesktopMobileHandoff } from "@/features/session/view/desktop-mobile-handoff";

export default function AppLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 1024;
  const isRegistrationDocumentsRoute =
    pathname.startsWith("/apply") ||
    pathname.startsWith("/me") ||
    pathname.includes("/apply") ||
    pathname.includes("/me");

  const status = useAuthStore((state) => state.status);
  const session = useCurrentSession(getApiClient(), { enabled: status === "signedIn" });
  const hasPartnerGrant = session.data?.user != null && hasRole(session.data.user, PARTNER_ROLE);
  const requirePartnerRole = routeRequiresPartnerRole(pathname);
  const isApplyRoute = pathname.startsWith("/apply");
  const shouldActAsPartner = !isApplyRoute && (requirePartnerRole || hasPartnerGrant);
  const guard = useAuthGuard(getApiClient(), {
    enabled: status === "signedIn" && !session.isPending,
    requiredRoles: shouldActAsPartner ? [PARTNER_ROLE] : [],
    requireActiveRole: shouldActAsPartner,
  });
  const signOut = useMobileLogout();
  const switchRole = useSwitchRole(getApiClient());
  const needsApproval = requirePartnerRole;
  const application = usePartnerApplication({
    enabled: guard.status === "authenticated" && hasRole(guard.user, PARTNER_ROLE),
  });
  const applicationMissing = application.error instanceof ApiRequestError && application.error.status === 404;
  const applicationUnknown = application.isError && !applicationMissing;
  const applicationSettled = !application.isPending || applicationMissing || applicationUnknown;
  const applicationStatus = applicationMissing ? null : (application.data?.status ?? null);
  const isApprovedPartner = applicationStatus === "APPROVED";
  const mustLeavePortal = needsApproval && applicationSettled && !applicationUnknown && !isApprovedPartner;

  useEffect(() => {
    if (status === "signedOut") {
      const fullUrl = pathname;
      router.replace(`/login?next=${encodeURIComponent(fullUrl)}`);
    }
  }, [pathname, router, status]);

  useEffect(() => {
    if (!mustLeavePortal) return;
    router.replace(homeForApplication(applicationStatus));
  }, [applicationStatus, mustLeavePortal, router]);

  let branch: GuardBranch = "ready";
  if (status === "loading" || session.isPending || guard.status === "checking") branch = "checking";
  else if (status === "signedOut" || guard.status === "unauthenticated") branch = "signin";
  else if (guard.status === "error") branch = "error";
  else if (guard.isSelectingRole) branch = "selecting";
  else if (guard.status === "forbidden") branch = hasRole(guard.user, PARTNER_ROLE) ? "switch" : "no-access";
  else if (needsApproval && !applicationSettled) branch = "approval-pending";
  else if (needsApproval && applicationUnknown) branch = "approval-unknown";
  else if (mustLeavePortal) branch = "leaving";

  return (
    <PartnerGuardView
      branch={branch}
      switching={switchRole.isPending}
      onRetry={() => {
        void session.refetch();
        void application.refetch();
      }}
      onSwitch={() => switchRole.mutate(PARTNER_ROLE)}
      onSignOut={() => void signOut()}
      onApply={() => router.push("/apply")}
    >
      <PartnerPresenceProvider>
        {isDesktop && isApprovedPartner && !isRegistrationDocumentsRoute ? (
          <DesktopMobileHandoff
            application={application.data}
            name={application.data?.display_name || guard.user?.full_name || guard.user?.display_name}
            phone={guard.user?.phone_number}
          />
        ) : (
          <>
            <Slot />
            <LiveOfferSheet />
          </>
        )}
      </PartnerPresenceProvider>
    </PartnerGuardView>
  );
}
