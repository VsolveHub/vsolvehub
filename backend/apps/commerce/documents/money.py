"""Rupees from paise, for documents only.

## Why this is here and not in `common`

It is the **first** server-side money formatter in this codebase, and that is deliberate rather
than an oversight to correct: every API publishes integer paise and lets the client render them,
which keeps one formatter per surface instead of two that can disagree. A PDF has no client, so it
needs one — and it is scoped to the package that needs it so it does not quietly become the second
authority on how money reads.

If a second server-side caller ever appears, that is the moment to promote it to `common`, with
the client's own `formatMoney` as the thing it has to match.
"""

from decimal import ROUND_HALF_UP, Decimal

#: The Indian system groups the last three digits, then twos: 12,34,567 rather than 1,234,567.
_LAST_GROUP = 3
_PAIR = 2


#: Indian digit grouping: the last three digits, then pairs. 1234567 paise reads as 12,345.67 and
#: 123456789 as 12,34,567.89 — not the 1,234,567.89 a naive thousands separator produces, which is
#: wrong on every invoice issued in this country.
def format_money(paise: int, *, symbol: str = "₹") -> str:
    rupees = (Decimal(paise) / Decimal(100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sign = "-" if rupees < 0 else ""
    whole, _, fraction = f"{abs(rupees):.2f}".partition(".")

    if len(whole) > _LAST_GROUP:
        head, tail = whole[:-_LAST_GROUP], whole[-_LAST_GROUP:]
        groups: list[str] = []
        while len(head) > _PAIR:
            groups.insert(0, head[-_PAIR:])
            head = head[:-_PAIR]
        if head:
            groups.insert(0, head)
        whole = ",".join([*groups, tail])

    return f"{sign}{symbol}{whole}.{fraction}"
