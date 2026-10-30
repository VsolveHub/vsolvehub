import type { Catalog, Locale } from "@vsolve/ui";

/** `features/session/partner-shell.tsx` — the chrome every signed-in screen shares. */

const en: Catalog = {
  "shell.switchToPartner.title": "Switch to your Partner account",
  "shell.focusedHeader.workOffer": "Work Offer",
  "shell.focusedHeader.arrivalCode": "Arrival code",
  "shell.focusedHeader.enquiry": "Enquiry",
  "shell.focusedHeader.jobDetails": "Job Details",
  "shell.focusedHeader.goBack": "Go back",
  "shell.nav.partnerNavigation": "Partner navigation",
  "shell.nav.home": "Home",
  "shell.localeSwitcher.ariaLabel": "Language",
  "shell.badge.partner": "Partner",
};

const te: Catalog = {
  "shell.switchToPartner.title": "మీ పార్ట్‌నర్ ఖాతాకు మారండి",
  "shell.focusedHeader.workOffer": "పని ఆఫర్",
  "shell.focusedHeader.arrivalCode": "రాక కోడ్",
  "shell.focusedHeader.enquiry": "విచారణ",
  "shell.focusedHeader.jobDetails": "పని వివరాలు",
  "shell.focusedHeader.goBack": "వెనక్కి వెళ్ళండి",
  "shell.nav.partnerNavigation": "పార్ట్‌నర్ నావిగేషన్",
  "shell.nav.home": "హోమ్",
  "shell.localeSwitcher.ariaLabel": "భాష",
  "shell.badge.partner": "పార్ట్‌నర్",
};

const hi: Catalog = {
  "shell.switchToPartner.title": "अपने पार्टनर खाते पर जाएं",
  "shell.focusedHeader.workOffer": "काम का ऑफर",
  "shell.focusedHeader.arrivalCode": "आगमन कोड",
  "shell.focusedHeader.enquiry": "पूछताछ",
  "shell.focusedHeader.jobDetails": "काम का विवरण",
  "shell.focusedHeader.goBack": "वापस जाएं",
  "shell.nav.partnerNavigation": "पार्टनर नेविगेशन",
  "shell.nav.home": "होम",
  "shell.localeSwitcher.ariaLabel": "भाषा",
  "shell.badge.partner": "पार्टनर",
};

export const catalogsByLocale: Record<Locale, Catalog> = {
  "en-IN": en,
  "te-IN": te,
  "hi-IN": hi,
};
