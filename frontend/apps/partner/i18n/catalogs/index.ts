import type { Catalog, Locale } from "@vsolve/ui";

import { catalogsByLocale as common } from "./common";
import { catalogsByLocale as uiShared } from "./ui-shared";
import { catalogsByLocale as shell } from "./shell";
import { catalogsByLocale as auth } from "./auth";
import { catalogsByLocale as apply } from "./apply";
import { catalogsByLocale as home } from "./home";
import { catalogsByLocale as work } from "./work";
import { catalogsByLocale as money } from "./money";
import { catalogsByLocale as me } from "./me";
import { catalogsByLocale as crew } from "./crew";
import { catalogsByLocale as notifications } from "./notifications";
import { catalogsByLocale as workspaces } from "./workspaces";
import { catalogsByLocale as proposal } from "./proposal";
import { catalogsByLocale as proposalRatecard } from "./proposal-ratecard";
import { catalogsByLocale as proposalScreens } from "./proposal-screens";
import { catalogsByLocale as visit } from "./visit";
import { catalogsByLocale as stays } from "./stays";
import { catalogsByLocale as rentals } from "./rentals";

/**
 * One domain file per feature area, each holding en/te/hi side by side so a
 * missing key is visible in the diff rather than discovered at runtime. This
 * file is the single merge point — nothing else assembles a `Catalog`.
 */
const MODULES: readonly Record<Locale, Catalog>[] = [
  common,
  uiShared,
  shell,
  auth,
  apply,
  home,
  work,
  money,
  me,
  crew,
  notifications,
  workspaces,
  proposal,
  proposalRatecard,
  proposalScreens,
  visit,
  stays,
  rentals,
];

function merge(locale: Locale): Catalog {
  return MODULES.reduce<Catalog>((acc, module) => ({ ...acc, ...module[locale] }), {});
}

export const catalogs: Record<Locale, Catalog> = {
  "en-IN": merge("en-IN"),
  "te-IN": merge("te-IN"),
  "hi-IN": merge("hi-IN"),
};
