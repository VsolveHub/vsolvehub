"""The three request vocabularies more than one slice of this package reads.

They sit here rather than beside the serializer that first needed them because `enquiries`,
`partner` and `rate_cards` all speak them, and a vocabulary imported across three sibling modules
is a shared name however small it looks. Nothing in this module imports from a sibling: the
dependency arrows in this package point at `base`, never out of it.
"""

#: Why a vendor declined an enquiry, published so both apps render one vocabulary.
#:
#: `07-state-machines-and-permissions.md` requires a reason on every decline and names none, and
#: `VendorInvitation.decline_reason_code` is deliberately left an unconstrained `SlugField` on the
#: model: the same column also carries **system** reasons (`requirement_changed` from a withdrawal,
#: `non_responsive_quote` from a Customer rejection), and constraining the column would refuse the
#: platform's own writes. The vocabulary therefore lives here, on the one surface a vendor types
#: into — which is where it was missing.
INVITATION_DECLINE_REASONS = (
    ("TOO_FAR", "Too far to travel"),
    ("NO_CAPACITY", "No capacity on those dates"),
    ("OUT_OF_SCOPE", "Not work we do"),
    ("BUDGET_TOO_LOW", "Budget is below what this costs"),
    ("UNCLEAR_SCOPE", "Cannot tell what is being asked for"),
    ("OTHER", "Another reason"),
)

#: Whose absence is being reported. A request-shape vocabulary with no column behind it — the
#: outcome is written as a `SiteVisit.Status`, not as this string.
VISIT_NO_SHOW_PARTIES = (
    ("VENDOR", "Vendor"),
    ("CUSTOMER", "Customer"),
)

#: Why the visit did not happen. Published at 1.26.0; until then `reason_code` was an unconstrained
#: slug declared required with an empty default, so the Partner app sent it **blank** rather than
#: invent a vocabulary Operations would then have to report on.
#:
#: These six are deliberately about the *fact*, not about the settlement. The settlement is already
#: decided by `party` and is not a thing either side gets to nominate: a vendor no-show replaces the
#: slot at no charge to the Customer, and a Customer no-show still pays the vendor's visit payout
#: because they travelled. A reason code that could change the money would be a refund button
#: labelled as a dropdown.
#:
#: `cancellation_reason_code` on the model stays an unconstrained slug for the reason
#: `decline_reason_code` does: the same column also carries the platform's own writes
#: (`vendor_no_show`, `customer_no_show` from the sweeps), and constraining it would refuse them.
VISIT_NO_SHOW_REASONS = (
    ("NOBODY_ON_SITE", "Nobody was at the address"),
    ("SITE_INACCESSIBLE", "Could not get access to the site"),
    ("ADDRESS_WRONG", "The address was wrong or could not be found"),
    ("VENDOR_DID_NOT_ARRIVE", "The professional never arrived"),
    ("CANCELLED_ON_THE_DAY", "The other party cancelled on the day"),
    ("OTHER", "Another reason"),
)
