// The rules live in `@vsolve/query`, shared with the phone app, so the two cannot drift apart.
// This file keeps the path the screens and tests already import from.
export {
  findSkillForCategory,
  groupByService,
  isServiceGroupSelected,
  isTradeCategorySelected,
  selectedTradeCategories,
  syncRequiredSkills,
  tickableCategories,
  toggleServiceGroup,
  toggleTradeCategorySelection,
  variantIdsForCategory,
} from "@vsolve/query/partner-work";
export type { CategoryRef as MainCategory, ServiceGroup } from "@vsolve/query/partner-work";
