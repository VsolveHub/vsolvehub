/**
 * The one way into the bank-account form, shared by every prompt that asks for it.
 *
 * Plain constants with no imports, so a pure adapter (`capability/adapters/gates.ts`) can use
 * them without pulling in the query layer.
 */

/** The payout account card's anchor. Arriving at it opens the bank form. */
export const ADD_BANK_ACCOUNT_ID = "add-bank-account";

/**
 * Where every "add your bank account" prompt in the app sends the Partner: the form, open.
 *
 * From another screen, link with `next/link`. From the Money screen itself, use a plain
 * `<a href={`#${ADD_BANK_ACCOUNT_ID}`}>`: a same-page `<Link>` changes the URL with
 * `pushState`, which fires no `hashchange`, so the card would never hear it.
 */
export const ADD_BANK_ACCOUNT_HREF = `/money#${ADD_BANK_ACCOUNT_ID}`;
