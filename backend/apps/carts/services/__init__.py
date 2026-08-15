"""Server-authoritative M1 cart, arrival-window, quote, and checkout commands.

Where each part lives:

* `base` — cart identity, request fingerprints, the optimistic-version guard, and the
  invalidation of plans and quotes derived from a superseded cart version.
* `merging` — folding an anonymous session cart into the Customer's, both the automatic
  pass and the round that carries the Customer's decision on each duplicate.
* `items` — the cart line-item commands: add, update, remove, the post-capture clear,
  and the legacy single-slot replace.
* `windows` — the signed arrival-window token and the availability grid the Customer
  picks a slot from; `build_arrival_window_grid` is shared with the reschedule and A5
  visit flows.
* `checkout` — pricing a cart into a `Quote`, and turning that quote into a
  `CheckoutSession`, `BookingGroup` and its fulfilment units.
"""

from .base import (
    _assert_cart_version,
    _cart_for,
    _cart_item_fingerprint,
    _cart_item_scope,
    _invalidate_cart_outputs,
    _request_fingerprint,
)
from .checkout import create_checkout, create_quote
from .items import (
    _scope_with_quantity,
    _validated_variant_inputs,
    add_cart_item,
    clear_booked_cart_items,
    remove_cart_item,
    replace_cart_item,
    update_cart_item,
)
from .merging import merge_session_cart, resolve_session_cart_merge
from .windows import (
    WINDOW_SIGNING_SALT,
    WINDOW_SIGNING_VERSION,
    BookingWindow,
    BookingWindowDay,
    BookingWindows,
    _resolve_scheduling_group,
    _signed_window_id,
    _window_start_from_id,
    build_arrival_window_grid,
    create_booking_windows,
)

__all__ = [
    "WINDOW_SIGNING_SALT",
    "WINDOW_SIGNING_VERSION",
    "BookingWindow",
    "BookingWindowDay",
    "BookingWindows",
    "_assert_cart_version",
    "_cart_for",
    "_cart_item_fingerprint",
    "_cart_item_scope",
    "_invalidate_cart_outputs",
    "_request_fingerprint",
    "_resolve_scheduling_group",
    "_scope_with_quantity",
    "_signed_window_id",
    "_validated_variant_inputs",
    "_window_start_from_id",
    "add_cart_item",
    "build_arrival_window_grid",
    "clear_booked_cart_items",
    "create_booking_windows",
    "create_checkout",
    "create_quote",
    "merge_session_cart",
    "remove_cart_item",
    "replace_cart_item",
    "resolve_session_cart_merge",
    "update_cart_item",
]
