import type { Schemas } from "@vsolve/api-client";
import { Card, useT } from "@vsolve/ui";

/**
 * How many men and how many women, role by role.
 *
 * ## Why this is a table and not a sentence
 *
 * A lead does not read this — they *check* it, against a roster they hold in
 * their head. "Three waiters, two of them women, plus two men on setup" is a
 * sentence you can nod along to and still get wrong. A column of numbers is
 * something you can count your own people against, and counting is the whole
 * job this screen exists to make possible before somebody accepts.
 *
 * ## Why it is the loudest thing on an offer
 *
 * Everything else on a crew offer is money and dates: a lead either meets them
 * or does not, and knows which. The mix is the one term they can be *wrong*
 * about without noticing — the roster feels big enough, the total matches, and
 * the shortfall only surfaces when names are assigned, possibly on the morning
 * of the event. So this sits above the fold and is not a disclosure.
 *
 * ## The totals row is the server's arithmetic, not ours
 *
 * `total` arrives per line rather than being summed here. Same reason the
 * money never is: two implementations of one sum is how a screen and a refusal
 * come to disagree, and the refusal (`m2_crew_mix_unmet`) is counted server-side.
 */

export interface CrewMixTableProps {
  readonly lines: readonly Schemas["CrewMixLine"][];
  /** Rendered under the table — the roster warning on an offer, nothing elsewhere. */
  readonly footnote?: string;
}

export function CrewMixTable({ lines, footnote }: CrewMixTableProps) {
  const t = useT();
  if (lines.length === 0) return null;

  const men = lines.reduce((sum, line) => sum + line.men, 0);
  const women = lines.reduce((sum, line) => sum + line.women, 0);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-text">{t("work.crewOfferMixTable.title")}</h2>
        <p className="text-sm font-bold text-text-secondary">
          {t("work.crewOfferMixTable.menCount", { count: men })} ·{" "}
          {t("work.crewOfferMixTable.womenCount", { count: women })}
        </p>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="pb-2 font-semibold text-text-secondary">
              {t("work.crewOfferMixTable.header.role")}
            </th>
            <th scope="col" className="pb-2 text-right font-semibold text-text-secondary">
              {t("work.crewOfferMixTable.header.men")}
            </th>
            <th scope="col" className="pb-2 text-right font-semibold text-text-secondary">
              {t("work.crewOfferMixTable.header.women")}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.role_code} className="border-b border-line/60 last:border-0">
              <th scope="row" className="py-2.5 pr-3 text-left font-semibold text-text">
                {line.role_label}
              </th>
              <td className="py-2.5 text-right tabular-nums">
                <Count value={line.men} />
              </td>
              <td className="py-2.5 text-right tabular-nums">
                <Count value={line.women} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {footnote === undefined ? null : (
        <p className="text-xs leading-5 text-text-muted">{footnote}</p>
      )}
    </Card>
  );
}

/**
 * A zero is greyed rather than hidden.
 *
 * "No women on setup" is a fact a lead plans around, and a blank cell reads as
 * missing data rather than as none. A role with nobody in it at all is absent
 * from `lines` entirely — that judgement is the server's.
 */
function Count({ value }: { readonly value: number }) {
  return (
    <span className={value === 0 ? "font-semibold text-text-muted" : "font-extrabold text-text"}>
      {value}
    </span>
  );
}
