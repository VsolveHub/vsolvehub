# Cart / Checkout Split + Per-Category Slots Implementation Plan

> **STATUS: COMPLETE.** Tasks 1–10 implemented and committed
> (`49cbd0b`, `b62adf0`, `8c8e538`, `46680cb`, `d470477`). Three design decisions changed during
> implementation — see the "Changes made during implementation" section of the spec. Promotions
> remain unbuilt and need their own plan.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the customer booking wizard into a real `/cart` page (items + compatibility-driven suggestions) and a real `/checkout` page (address → one slot per server-derived category group → review → confirm), and make the post-confirm assignment wait a first-class screen.

**Architecture:** The platform decides which services share a visit — `_build_sequential_groups` already computes this from `ServiceCompatibilityRule`, and its `starts_at` argument only feeds a capacity probe, so the grouping can be published *before* any time is chosen. A new read exposes those groups; plan-set creation takes one start per group instead of one for the whole cart. The plan set id in the URL is the only state carried between the two routes.

**Tech Stack:** Django 5 + DRF + drf-spectacular (backend), Next.js App Router + TanStack Query + Tailwind v4 (frontend), pytest, vitest, Playwright.

## Global Constraints

- **Payment lifecycle is NOT changed.** `POST /checkouts/` charges nothing; payment happens after every partner commits. See `docs/superpowers/specs/2026-08-06-cart-checkout-split-design.md` §2.
- **No client-side money.** Every rupee rendered comes from a server field. No summing, no fee derivation, no tax arithmetic in the browser.
- **No inferred grouping.** The client never decides which services share a visit. It renders `scheduling-groups`.
- **No fallback/mock data.** When suggestions are empty the section does not render. No "popular near you" substitute.
- **Contract is generated, never hand-edited.** `python manage.py spectacular --file ../contracts/openapi/v1.yaml --validate`, then `pnpm contract:generate`.
- **Query keys live only in `frontend/packages/query/src/keys.ts`.** Inline key literals break invalidation.
- Backend gate: `backend\scripts\quality.cmd` (ruff format, ruff check, mypy, pytest, makemigrations --check, spectacular diff).
- Frontend gate: `pnpm verify` from `frontend/` (contract:check, lint, typecheck, test, build).
- Browser suite runs **once at the end**, not per task (project policy).
- Commit at the end of each task; do not push.

---

### Task 1: Publish the scheduling grouping as a domain function

Extract the grouping the planner already computes into a function that does not require a committed start, and prove the grouping is stable across probe times.

**Files:**
- Modify: `backend/apps/carts/planning.py`
- Test: `backend/tests/carts/test_scheduling_groups.py`

**Interfaces:**
- Consumes: `_planning_items`, `_current_rules`, `_build_sequential_groups`, `PlanningItem` (all existing in `planning.py`).
- Produces:
  ```python
  @dataclass(frozen=True, slots=True)
  class SchedulingGroup:
      key: str
      label: str
      estimated_duration_minutes: int
      cart_item_ids: tuple[UUID, ...]

  def scheduling_groups(*, cart: Cart, area: ServiceArea, at: datetime) -> tuple[SchedulingGroup, ...]
  def scheduling_group_key(cart_item_ids: Iterable[UUID]) -> str
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/tests/carts/test_scheduling_groups.py`. Follow the fixture style already used in `backend/tests/carts/test_fulfilment_planning.py` — read that file first and reuse its cart/variant/rule builders rather than inventing new ones.

```python
import pytest
from django.utils import timezone

from apps.carts.planning import scheduling_group_key, scheduling_groups


@pytest.mark.django_db
def test_incompatible_variants_produce_one_group_each(two_incompatible_item_cart, service_area):
    cart, electrician_item, salon_item = two_incompatible_item_cart
    groups = scheduling_groups(cart=cart, area=service_area, at=timezone.now())

    assert len(groups) == 2
    assert {frozenset(group.cart_item_ids) for group in groups} == {
        frozenset({electrician_item.id}),
        frozenset({salon_item.id}),
    }


@pytest.mark.django_db
def test_same_partner_sequential_variants_share_one_group(compatible_item_cart, service_area):
    cart, first, second = compatible_item_cart
    groups = scheduling_groups(cart=cart, area=service_area, at=timezone.now())

    assert len(groups) == 1
    assert set(groups[0].cart_item_ids) == {first.id, second.id}
    assert groups[0].estimated_duration_minutes > 0


@pytest.mark.django_db
def test_group_key_is_stable_across_probe_times(two_incompatible_item_cart, service_area):
    """The key must not depend on when it was asked for, or every poll reopens the modal."""
    cart, _, _ = two_incompatible_item_cart
    now = timezone.now()

    first = scheduling_groups(cart=cart, area=service_area, at=now)
    later = scheduling_groups(cart=cart, area=service_area, at=now + timezone.timedelta(hours=6))

    assert [group.key for group in first] == [group.key for group in later]


def test_group_key_ignores_input_order():
    import uuid

    left, right = uuid.uuid4(), uuid.uuid4()
    assert scheduling_group_key([left, right]) == scheduling_group_key([right, left])
```

- [ ] **Step 2: Run the test to verify it fails**

```
cd backend && .venv\Scripts\python.exe -m pytest tests/carts/test_scheduling_groups.py -v
```

Expected: FAIL — `ImportError: cannot import name 'scheduling_groups'`.

- [ ] **Step 3: Implement**

Add to `backend/apps/carts/planning.py`, below `_candidate_alternatives`:

```python
def scheduling_group_key(cart_item_ids: Iterable[UUID]) -> str:
    """A stable identity for one group, derived only from its membership.

    Order-independent and time-independent on purpose. The client sends this key
    back with a chosen start, and plan-set creation matches on it; a key that moved
    when the probe time moved would reopen the slot picker on every poll.
    """
    joined = ",".join(sorted(str(value) for value in cart_item_ids))
    return hashlib.sha256(joined.encode()).hexdigest()[:32]


def _group_label(items: tuple[PlanningItem, ...]) -> str:
    """The category the group's work belongs to.

    Groups only ever form between variants a rule allows one Partner to do in
    sequence, so the first item's category names the whole group. Falls back to the
    service name when a category is missing rather than inventing a heading.
    """
    service = items[0].item.variant.service
    category = getattr(service, "category", None)
    return category.name if category is not None else service.name


def scheduling_groups(
    *,
    cart: Cart,
    area: ServiceArea,
    at: datetime,
) -> tuple[SchedulingGroup, ...]:
    """How this cart splits into separately-schedulable visits.

    The same computation the planner performs, published before a start time has
    been chosen. `at` feeds the capacity probe inside `_build_sequential_groups`
    and the effective-dating of compatibility rules; it does not decide *whether*
    two variants may share a Partner, which is what makes this answerable early.
    """
    items = _planning_items(cart)
    rules = _current_rules(items, at=at)
    grouped = _build_sequential_groups(
        _order_items_by_dependencies(items, rules=rules),
        rules=rules,
        area=area,
        starts_at=at,
    )
    return tuple(
        SchedulingGroup(
            key=scheduling_group_key(entry.item.id for entry in group),
            label=_group_label(group),
            estimated_duration_minutes=sum(entry.duration_minutes for entry in group),
            cart_item_ids=tuple(entry.item.id for entry in group),
        )
        for group in grouped
    )
```

Add the dataclass beside `ProposedAlternative`:

```python
@dataclass(frozen=True, slots=True)
class SchedulingGroup:
    key: str
    label: str
    estimated_duration_minutes: int
    cart_item_ids: tuple[UUID, ...]
```

Add `from collections.abc import Iterable` to the imports if it is not already present.

- [ ] **Step 4: Run the test to verify it passes**

```
cd backend && .venv\Scripts\python.exe -m pytest tests/carts/test_scheduling_groups.py -v
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/carts/planning.py backend/tests/carts/test_scheduling_groups.py
git commit -m "feat(carts): publish scheduling groups as a time-independent domain function"
```

---

### Task 2: `POST /api/v1/cart/scheduling-groups/`

**Files:**
- Modify: `backend/apps/carts/serializers.py`, `backend/apps/carts/views.py`, `backend/apps/carts/urls.py`
- Modify: `contracts/openapi/v1.yaml` (regenerated, never hand-edited)
- Test: `backend/tests/carts/test_scheduling_groups_api.py`

**Interfaces:**
- Consumes: `scheduling_groups`, `SchedulingGroup` from Task 1.
- Produces: response body `{ "cart_version": int, "groups": [{ "key": str, "label": str, "estimated_duration_minutes": int, "cart_item_ids": [uuid] }] }`.

- [ ] **Step 1: Write the failing test**

```python
import pytest
from rest_framework import status


@pytest.mark.django_db
def test_returns_one_group_per_incompatible_category(
    authenticated_client, two_incompatible_item_cart, customer_address
):
    cart, _, _ = two_incompatible_item_cart
    response = authenticated_client.post(
        "/api/v1/cart/scheduling-groups/",
        {"address_id": str(customer_address.id), "expected_cart_version": cart.version},
        format="json",
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data["cart_version"] == cart.version
    assert len(response.data["groups"]) == 2
    assert all(group["key"] for group in response.data["groups"])
    assert all(group["estimated_duration_minutes"] > 0 for group in response.data["groups"])


@pytest.mark.django_db
def test_stale_cart_version_is_refused(
    authenticated_client, two_incompatible_item_cart, customer_address
):
    cart, _, _ = two_incompatible_item_cart
    response = authenticated_client.post(
        "/api/v1/cart/scheduling-groups/",
        {"address_id": str(customer_address.id), "expected_cart_version": cart.version + 5},
        format="json",
    )

    assert response.status_code == status.HTTP_409_CONFLICT


@pytest.mark.django_db
def test_another_customers_address_is_not_found(
    authenticated_client, two_incompatible_item_cart, other_customer_address
):
    cart, _, _ = two_incompatible_item_cart
    response = authenticated_client.post(
        "/api/v1/cart/scheduling-groups/",
        {"address_id": str(other_customer_address.id), "expected_cart_version": cart.version},
        format="json",
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
```

- [ ] **Step 2: Run to verify it fails**

```
cd backend && .venv\Scripts\python.exe -m pytest tests/carts/test_scheduling_groups_api.py -v
```

Expected: FAIL with 404 (route not registered).

- [ ] **Step 3: Add serializers**

In `backend/apps/carts/serializers.py`, beside `FulfilmentPlanSetCreateSerializer`:

```python
class SchedulingGroupsRequestSerializer(serializers.Serializer[dict[str, object]]):
    address_id = serializers.UUIDField()
    expected_cart_version = serializers.IntegerField(min_value=1)


class SchedulingGroupSerializer(serializers.Serializer[dict[str, object]]):
    key = serializers.CharField()
    label = serializers.CharField()
    estimated_duration_minutes = serializers.IntegerField()
    cart_item_ids = serializers.ListField(child=serializers.UUIDField())


class SchedulingGroupsSerializer(serializers.Serializer[dict[str, object]]):
    cart_version = serializers.IntegerField()
    groups = SchedulingGroupSerializer(many=True)
```

- [ ] **Step 4: Add the view**

In `backend/apps/carts/views.py`, after `BookingWindowsView`. Match that view's shape for session/cart resolution — read it first.

```python
class CartSchedulingGroupsView(APIView):
    """How the current cart splits into separately-schedulable visits.

    A read, not a command: nothing is reserved, priced or persisted. It exists so
    the Customer can be shown one slot picker per visit *before* choosing any time,
    which the plan-set command cannot answer because it requires the times as input.

    Serviceability is resolved here for the same reason the planner resolves it:
    the grouping is per service area, and an address outside one has no groups
    rather than empty ones.
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        tags=["Cart"],
        request=SchedulingGroupsRequestSerializer,
        responses={200: SchedulingGroupsSerializer, 409: ApiErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        serializer = SchedulingGroupsRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = cast(User, request.user)
        cart = merge_session_cart(user=user, session_key=_session_key(request))
        if cart.version != serializer.validated_data["expected_cart_version"]:
            raise CartVersionConflictApiError
        address = get_object_or_404(
            Address,
            id=serializer.validated_data["address_id"],
            customer=user,
            archived_at__isnull=True,
        )
        now = timezone.now()
        area = _resolve_cart_service_area(cart=cart, address=address, at=now)
        groups = scheduling_groups(cart=cart, area=area, at=now)
        return Response(
            SchedulingGroupsSerializer(
                {
                    "cart_version": cart.version,
                    "groups": [
                        {
                            "key": group.key,
                            "label": group.label,
                            "estimated_duration_minutes": group.estimated_duration_minutes,
                            "cart_item_ids": list(group.cart_item_ids),
                        }
                        for group in groups
                    ],
                }
            ).data
        )
```

`_resolve_cart_service_area` is the serviceability loop already inside `create_fulfilment_plan_set` (`planning.py`, the `for entry in items:` block that raises `FulfilmentPlanUnavailableApiError`). Extract it into a module-level helper in `planning.py` and call it from **both** places — do not copy it:

```python
def _resolve_cart_service_area(
    *,
    cart: Cart,
    address: Address,
    at: datetime,
    items: tuple[PlanningItem, ...] | None = None,
) -> ServiceArea:
    """The one service area every item in this cart resolves to at `at`.

    Raises `FulfilmentPlanUnavailableApiError` with per-item reasons when an item
    is unserviceable or the cart straddles two areas. Shared by the planner and the
    scheduling-groups read so the two cannot disagree about where a cart can happen.
    """
    entries = _planning_items(cart) if items is None else items
    service_area: ServiceArea | None = None
    failures: list[dict[str, object]] = []
    for entry in entries:
        decision = check_serviceability(
            postal_code=address.postal_code,
            variant_id=entry.item.variant_id,
            requested_start=at,
            duration_minutes=entry.duration_minutes,
        )
        if not decision.is_serviceable or decision.service_area is None:
            failures.append(
                {
                    "cart_item_id": str(entry.item.id),
                    "reason": decision.reason_code or "not_serviceable",
                }
            )
        elif service_area is None:
            service_area = decision.service_area
        elif service_area.id != decision.service_area.id:
            failures.append(
                {"cart_item_id": str(entry.item.id), "reason": "different_service_area"}
            )
    if failures or service_area is None:
        raise FulfilmentPlanUnavailableApiError(reasons=failures)
    return service_area
```

Then replace that block in `create_fulfilment_plan_set` with a call to it.

- [ ] **Step 5: Register the route**

In `backend/apps/carts/urls.py`, add `CartSchedulingGroupsView` to the import block and add:

```python
    path("cart/scheduling-groups/", CartSchedulingGroupsView.as_view()),
```

directly after the `cart/merge/` line.

- [ ] **Step 6: Run the tests**

```
cd backend && .venv\Scripts\python.exe -m pytest tests/carts/ -v
```

Expected: PASS, including the existing planning tests (the extracted helper must not change their behaviour).

- [ ] **Step 7: Regenerate the contract**

```
cd backend && .venv\Scripts\python.exe manage.py spectacular --file ../contracts/openapi/v1.yaml --validate
```

- [ ] **Step 8: Commit**

```bash
git add backend/apps/carts/ backend/tests/carts/ contracts/openapi/v1.yaml
git commit -m "feat(api): publish POST /cart/scheduling-groups/"
```

---

### Task 3: `POST /api/v1/cart/suggestions/`

Services the same professional could add to an existing visit. Real signal only — an active `SAME_PARTNER_SEQUENTIAL` rule against something already in the cart.

**Files:**
- Modify: `backend/apps/carts/planning.py`, `serializers.py`, `views.py`, `urls.py`
- Test: `backend/tests/carts/test_cart_suggestions.py`

**Interfaces:**
- Consumes: `_planning_items`, `ServiceCompatibilityRule`, the `ServiceCard` serializer from `apps/catalog/serializers.py`.
- Produces: `def cart_suggestions(*, cart: Cart, limit: int = 4) -> tuple[ServiceVariant, ...]`; response `{ "cart_version": int, "suggestions": [ServiceCard] }`.

- [ ] **Step 1: Write the failing test**

```python
import pytest
from rest_framework import status

from apps.carts.planning import cart_suggestions


@pytest.mark.django_db
def test_suggests_only_same_partner_sequential_partners(
    single_item_cart, compatible_variant, unrelated_variant
):
    """A suggestion claims one professional can add this to the same visit.

    Anything without an active SAME_PARTNER_SEQUENTIAL rule would make that claim
    falsely, so it must not appear — including a variant with a PARALLEL_ALLOWED
    rule, which means a *second* professional.
    """
    suggestions = cart_suggestions(cart=single_item_cart)

    assert compatible_variant in suggestions
    assert unrelated_variant not in suggestions


@pytest.mark.django_db
def test_variants_already_in_the_cart_are_excluded(two_compatible_item_cart):
    cart, first, second = two_compatible_item_cart
    suggestions = cart_suggestions(cart=cart)

    assert first.variant not in suggestions
    assert second.variant not in suggestions


@pytest.mark.django_db
def test_expired_rules_do_not_suggest(single_item_cart, expired_rule_variant):
    assert expired_rule_variant not in cart_suggestions(cart=single_item_cart)


@pytest.mark.django_db
def test_empty_cart_suggests_nothing(empty_cart):
    assert cart_suggestions(cart=empty_cart) == ()


@pytest.mark.django_db
def test_api_returns_service_cards(authenticated_client, single_item_cart, compatible_variant):
    response = authenticated_client.post("/api/v1/cart/suggestions/", {}, format="json")

    assert response.status_code == status.HTTP_200_OK
    assert response.data["cart_version"] == single_item_cart.version
    slugs = {card["slug"] for card in response.data["suggestions"]}
    assert compatible_variant.service.slug in slugs
```

- [ ] **Step 2: Run to verify it fails**

```
cd backend && .venv\Scripts\python.exe -m pytest tests/carts/test_cart_suggestions.py -v
```

Expected: FAIL — `cannot import name 'cart_suggestions'`.

- [ ] **Step 3: Implement the selector**

In `backend/apps/carts/planning.py`:

```python
def cart_suggestions(*, cart: Cart, limit: int = 4) -> tuple[ServiceVariant, ...]:
    """Services one Partner could add to a visit this cart already has.

    The signal is an active `SAME_PARTNER_SEQUENTIAL` compatibility rule against
    something already in the cart — the same rule the planner uses to merge work
    into one unit. That is why the copy can promise "same professional, same
    visit": it is the platform's own merge decision, not a merchandising guess.

    `PARALLEL_ALLOWED` is deliberately excluded. It means a *second* Partner, which
    is a second visit minimum, so suggesting it under this heading would be false.

    Returns empty rather than substituting popular services. A cart with nothing
    compatible has nothing to say here, and saying it anyway would be a fabricated
    relationship.
    """
    try:
        items = _planning_items(cart)
    except ValueError:
        return ()

    now = timezone.now()
    present = {entry.item.variant_id for entry in items}
    rules = (
        ServiceCompatibilityRule.objects.filter(
            mode=ServiceCompatibilityRule.Mode.SAME_PARTNER_SEQUENTIAL,
            is_active=True,
            lifecycle_status=ServiceCompatibilityRule.LifecycleStatus.ACTIVE,
            effective_from__lte=now,
        )
        .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gt=now))
        .filter(models.Q(left_variant_id__in=present) | models.Q(right_variant_id__in=present))
        .select_related("left_variant__service", "right_variant__service")
    )

    seen: dict[UUID, ServiceVariant] = {}
    for rule in rules:
        for near, far in (
            (rule.left_variant_id, rule.right_variant),
            (rule.right_variant_id, rule.left_variant),
        ):
            if near in present and far.id not in present and far.id not in seen:
                seen[far.id] = far
    return tuple(seen.values())[:limit]
```

Ensure `ServiceVariant` is imported in `planning.py` (it is imported in `models.py`; add it here if missing).

- [ ] **Step 4: Add serializer, view and route**

`serializers.py`:

```python
class CartSuggestionsSerializer(serializers.Serializer[dict[str, object]]):
    cart_version = serializers.IntegerField()
    suggestions = ServiceCardSerializer(many=True)
```

Import `ServiceCardSerializer` from `apps.catalog.serializers`. Open that module first and use the exact class name it exports; if the catalog builds cards through a selector rather than a serializer, reuse that selector instead of writing a second card shape.

`views.py`:

```python
class CartSuggestionsView(APIView):
    """Services one Partner could add to a visit this cart already has.

    POST rather than GET because the answer is derived from the caller's own cart,
    which is resolved from the session — there is no cacheable URL for it, and a
    GET would invite one.
    """

    permission_classes = (AllowAny,)

    @extend_schema(
        tags=["Cart"],
        request=None,
        responses={200: CartSuggestionsSerializer},
    )
    def post(self, request: Request) -> Response:
        cart = _resolve_cart(request)
        variants = cart_suggestions(cart=cart)
        return Response(
            CartSuggestionsSerializer(
                {
                    "cart_version": cart.version,
                    "suggestions": [variant.service for variant in variants],
                }
            ).data
        )
```

`_resolve_cart(request)` is the anonymous-or-authenticated cart lookup `CartView.get` already performs — extract it from `CartView` into a module-level helper in `views.py` and call it from both, so an anonymous cart gets suggestions too.

`urls.py`: add `path("cart/suggestions/", CartSuggestionsView.as_view()),` after the scheduling-groups line, and add the view to the import block.

- [ ] **Step 5: Run tests and regenerate the contract**

```
cd backend && .venv\Scripts\python.exe -m pytest tests/carts/ -v
cd backend && .venv\Scripts\python.exe manage.py spectacular --file ../contracts/openapi/v1.yaml --validate
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/carts/ backend/tests/carts/ contracts/openapi/v1.yaml
git commit -m "feat(api): suggest compatible services for the cart"
```

---

### Task 4: Per-group starts on plan-set creation

**Files:**
- Modify: `backend/apps/carts/planning.py` (`create_fulfilment_plan_set`, `_unit_schedule`, `_candidate_alternatives`, `_price_alternative`)
- Modify: `backend/apps/carts/serializers.py`, `backend/apps/carts/views.py`, `backend/apps/carts/exceptions.py`
- Test: `backend/tests/carts/test_per_group_starts.py`

**Interfaces:**
- Consumes: `scheduling_group_key` (Task 1).
- Produces: `create_fulfilment_plan_set(..., preferred_starts: Mapping[str, datetime])` replacing `preferred_start: datetime`. New error `SchedulingGroupsChangedApiError` with code `scheduling_groups_changed`.

- [ ] **Step 1: Write the failing test**

```python
import pytest
from django.utils import timezone
from rest_framework import status

from apps.carts.exceptions import SchedulingGroupsChangedApiError
from apps.carts.planning import create_fulfilment_plan_set, scheduling_group_key


@pytest.mark.django_db
def test_each_group_starts_at_its_own_chosen_time(
    customer, two_incompatible_item_cart, customer_address, monday_slots
):
    """Two incompatible services scheduled days apart must not cascade off one cursor."""
    cart, electrician, salon = two_incompatible_item_cart
    electrician_start, salon_start = monday_slots

    plan_set = create_fulfilment_plan_set(
        customer=customer,
        cart=cart,
        address=customer_address,
        expected_cart_version=cart.version,
        preferred_starts={
            scheduling_group_key([electrician.id]): electrician_start,
            scheduling_group_key([salon.id]): salon_start,
        },
    )

    plan = plan_set.plans.get(is_recommended=True)
    starts = {unit.requested_start for unit in plan.units.all()}
    assert starts == {electrician_start, salon_start}


@pytest.mark.django_db
def test_unknown_group_key_is_refused(
    customer, two_incompatible_item_cart, customer_address, monday_slots
):
    cart, _, _ = two_incompatible_item_cart
    with pytest.raises(SchedulingGroupsChangedApiError):
        create_fulfilment_plan_set(
            customer=customer,
            cart=cart,
            address=customer_address,
            expected_cart_version=cart.version,
            preferred_starts={"not-a-real-group-key": monday_slots[0]},
        )


@pytest.mark.django_db
def test_missing_group_is_refused(
    customer, two_incompatible_item_cart, customer_address, monday_slots
):
    """Every group must carry a start. A missing one cannot be defaulted."""
    cart, electrician, _ = two_incompatible_item_cart
    with pytest.raises(SchedulingGroupsChangedApiError):
        create_fulfilment_plan_set(
            customer=customer,
            cart=cart,
            address=customer_address,
            expected_cart_version=cart.version,
            preferred_starts={scheduling_group_key([electrician.id]): monday_slots[0]},
        )


@pytest.mark.django_db
def test_api_accepts_preferred_starts(
    authenticated_client, two_incompatible_item_cart, customer_address, monday_slots
):
    cart, electrician, salon = two_incompatible_item_cart
    response = authenticated_client.post(
        "/api/v1/fulfilment-plan-sets/",
        {
            "address_id": str(customer_address.id),
            "expected_cart_version": cart.version,
            "preferred_starts": [
                {"group_key": scheduling_group_key([electrician.id]),
                 "starts_at": monday_slots[0].isoformat()},
                {"group_key": scheduling_group_key([salon.id]),
                 "starts_at": monday_slots[1].isoformat()},
            ],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="test-key-per-group-starts",
    )

    assert response.status_code == status.HTTP_201_CREATED
```

- [ ] **Step 2: Run to verify it fails**

```
cd backend && .venv\Scripts\python.exe -m pytest tests/carts/test_per_group_starts.py -v
```

Expected: FAIL — `preferred_starts` is not a parameter.

- [ ] **Step 3: Add the exception**

In `backend/apps/carts/exceptions.py`, following the existing `FulfilmentPlanStaleApiError` pattern:

```python
class SchedulingGroupsChangedApiError(ConflictApiError):
    """The visits the Customer scheduled against are not the visits this cart makes now.

    Raised rather than repaired. Re-deriving groups and silently reassigning the
    times would move a visit the Customer never agreed to move; the client refetches
    `scheduling-groups` and asks again.
    """

    default_code = "scheduling_groups_changed"
    default_detail = (
        "Your booking changed, so the visits you picked times for no longer match. "
        "Nothing has been booked. Choose your times again."
    )
```

Use whatever base class `FulfilmentPlanStaleApiError` uses — read `exceptions.py` and match it exactly, including how the 409 status is produced.

- [ ] **Step 4: Thread per-group starts through the planner**

In `planning.py`:

1. Change the signature: `preferred_start: datetime` → `preferred_starts: Mapping[str, datetime]`.
2. After resolving `items`, derive the groups and validate the submitted keys:

```python
    submitted = dict(preferred_starts)
    earliest = min(submitted.values()) if submitted else now
    service_area = _resolve_cart_service_area(cart=locked_cart, address=address, at=earliest, items=items)
    groups = scheduling_groups(cart=locked_cart, area=service_area, at=earliest)
    if {group.key for group in groups} != set(submitted):
        raise SchedulingGroupsChangedApiError
    starts_by_item: dict[UUID, datetime] = {
        item_id: submitted[group.key] for group in groups for item_id in group.cart_item_ids
    }
```

3. Validate each start against its own group's service area timezone:

```python
    for starts_at in submitted.values():
        _assert_window_time_is_current(
            starts_at=starts_at,
            area_timezone=service_area.timezone,
            now=now,
        )
```

4. `_candidate_alternatives` and `_build_sequential_groups` take `preferred_start` only for the capacity probe — pass `earliest`.
5. Replace `_unit_schedule` entirely. It currently walks one cursor across all groups:

```python
def _unit_schedule(
    proposal: ProposedAlternative,
    *,
    starts_by_item: Mapping[UUID, datetime],
) -> tuple[datetime, ...]:
    """Each unit starts when the Customer said its group should start.

    No cursor. The previous implementation advanced one clock across every group,
    which is exactly the behaviour that made a single `preferred_start` the only
    expressible schedule. Sequencing *within* a unit is still the Partner's problem
    and is covered by the unit's duration.
    """
    return tuple(starts_by_item[group[0].item.id] for group in proposal.groups)
```

Update `_price_alternative` to pass `starts_by_item` through instead of `preferred_start`.

6. Record the per-group starts in the fingerprint and the planning snapshot so idempotency and audit stay honest:

```python
        "preferred_starts": {key: value.isoformat() for key, value in sorted(submitted.items())},
```

replacing the existing `"preferred_start": preferred_start.isoformat(),` line.

- [ ] **Step 5: Update the serializer and view**

`serializers.py`:

```python
class PreferredStartSerializer(serializers.Serializer[dict[str, object]]):
    group_key = serializers.CharField(max_length=64)
    starts_at = serializers.DateTimeField()


class FulfilmentPlanSetCreateSerializer(serializers.Serializer[dict[str, object]]):
    address_id = serializers.UUIDField()
    expected_cart_version = serializers.IntegerField(min_value=1)
    preferred_starts = PreferredStartSerializer(many=True, allow_empty=False)

    def validate_preferred_starts(self, value: list[dict[str, object]]) -> list[dict[str, object]]:
        keys = [entry["group_key"] for entry in value]
        if len(keys) != len(set(keys)):
            raise serializers.ValidationError("Each visit may be given only one start time.")
        return value
```

`views.py`, inside `FulfilmentPlanSetView.post`'s `command()`:

```python
                    preferred_starts={
                        entry["group_key"]: entry["starts_at"]
                        for entry in serializer.validated_data["preferred_starts"]
                    },
```

and add `except SchedulingGroupsChangedApiError: raise` is unnecessary — it is an API error and propagates on its own. Confirm by reading how `FulfilmentPlanStaleApiError` escapes the same `try` block; if that block catches bare `ValueError`, ensure the new error is raised *before* entering it or is not a `ValueError` subclass.

- [ ] **Step 6: Update existing callers and tests**

```
cd backend && .venv\Scripts\python.exe -m pytest tests/carts/ tests/integration/ -v
```

`tests/carts/test_fulfilment_planning.py` and `test_planning_properties.py` call `create_fulfilment_plan_set` with `preferred_start=`. Update each call to build a single-group mapping:

```python
preferred_starts={scheduling_group_key([item.id for item in cart_items]): start}
```

Read each failing call and derive the correct grouping from that test's fixture — do not assume every fixture is one group.

- [ ] **Step 7: Full backend gate**

```
cd backend && .\scripts\quality.cmd
```

Expected: PASS. This regenerates nothing — run `spectacular` yourself if it reports the contract stale:

```
cd backend && .venv\Scripts\python.exe manage.py spectacular --file ../contracts/openapi/v1.yaml --validate
```

- [ ] **Step 8: Commit**

```bash
git add backend/ contracts/openapi/v1.yaml
git commit -m "feat(planning): one start per scheduling group instead of one per cart"
```

---

### Task 5: Regenerate the typed client and add query keys

**Files:**
- Modify: `frontend/packages/api-client/src/schema.d.ts` (generated)
- Modify: `frontend/packages/query/src/keys.ts`
- Test: `frontend/packages/query/src/keys.test.ts` (create if absent)

**Interfaces:**
- Produces: `queryKeys.booking.schedulingGroups({ cartVersion, addressId })`, `queryKeys.booking.suggestions(cartVersion)`.

- [ ] **Step 1: Regenerate**

```
cd frontend && pnpm contract:generate
```

- [ ] **Step 2: Add the keys**

In `frontend/packages/query/src/keys.ts`, inside `booking`, after `windows`:

```ts
    /**
     * How this cart splits into separately-schedulable visits.
     *
     * Keyed by cart version and address for the same reason `windows` is: the
     * grouping is a function of what is in the cart and which service area it
     * happens in, and serving one cart's grouping for another would open a slot
     * picker for a visit that does not exist.
     */
    schedulingGroups: (input: { cartVersion: number; addressId: string }) =>
      [...queryKeys.booking.all, "scheduling-groups", input] as const,

    /**
     * Services a Partner could add to a visit this cart already has.
     *
     * Keyed by cart version alone — the suggestion set is derived from what is in
     * the cart and from compatibility rules, neither of which depends on address.
     */
    suggestions: (cartVersion: number) =>
      [...queryKeys.booking.all, "suggestions", cartVersion] as const,
```

- [ ] **Step 3: Test the keys are distinct and stable**

```ts
import { describe, expect, it } from "vitest";
import { queryKeys } from "./keys";

describe("scheduling group keys", () => {
  it("separates carts at different versions", () => {
    const first = queryKeys.booking.schedulingGroups({ cartVersion: 1, addressId: "a" });
    const second = queryKeys.booking.schedulingGroups({ cartVersion: 2, addressId: "a" });
    expect(first).not.toEqual(second);
  });

  it("separates addresses at the same cart version", () => {
    expect(queryKeys.booking.schedulingGroups({ cartVersion: 1, addressId: "a" })).not.toEqual(
      queryKeys.booking.schedulingGroups({ cartVersion: 1, addressId: "b" }),
    );
  });

  it("nests under booking so a cart mutation can invalidate it", () => {
    expect(queryKeys.booking.schedulingGroups({ cartVersion: 1, addressId: "a" })).toEqual(
      expect.arrayContaining([...queryKeys.booking.all]),
    );
  });
});
```

- [ ] **Step 4: Run**

```
cd frontend && pnpm vitest run packages/query
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/packages/
git commit -m "chore(query): regenerate client and add scheduling-group keys"
```

---

### Task 6: Cart and checkout query layers

**Files:**
- Create: `frontend/apps/customer/features/cart/queries.ts`
- Create: `frontend/apps/customer/features/checkout/queries.ts`
- Move: `frontend/apps/customer/features/booking/group/queries.ts` → split between the two
- Test: `frontend/apps/customer/features/cart/queries.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // cart/queries.ts — re-exports the existing cart hooks unchanged, plus:
  export function useCartSuggestions(cartVersion: number | null)
  // checkout/queries.ts
  export function useSchedulingGroups(input: { cartVersion: number; addressId: string } | null)
  export function useCreatePlanSet()   // now takes preferredStarts
  export interface CreatePlanSetInput {
    cartVersion: number;
    addressId: string;
    preferredStarts: { groupKey: string; startsAt: string }[];
  }
  ```

- [ ] **Step 1: Write the failing test**

Follow the MSW-style harness in the existing `features/booking/group/queries.test.tsx` — read it and reuse its `renderHook` wrapper and server setup.

```tsx
it("returns nothing when the server has no compatible services", async () => {
  server.use(
    http.post("*/api/v1/cart/suggestions/", () =>
      HttpResponse.json({ cart_version: 3, suggestions: [] }),
    ),
  );

  const { result } = renderHook(() => useCartSuggestions(3), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([]);
});

it("keys scheduling groups by cart version so a cart edit does not reuse them", async () => {
  const { result, rerender } = renderHook(
    ({ version }) => useSchedulingGroups({ cartVersion: version, addressId: "addr-1" }),
    { wrapper, initialProps: { version: 1 } },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  rerender({ version: 2 });
  expect(result.current.isPending).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd frontend && pnpm vitest run apps/customer/features/cart
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`features/checkout/queries.ts`:

```ts
export type SchedulingGroup = Schemas["SchedulingGroup"];

/**
 * How Django splits this cart into separately-schedulable visits.
 *
 * `VOLATILE_STATE`: the grouping depends on which Partners can currently cover
 * the combined work, so a cached answer is a claim the server has stopped
 * standing behind. The slot modal reads this and nothing else — the client does
 * not decide which services share a visit.
 */
export function useSchedulingGroups(input: { cartVersion: number; addressId: string } | null) {
  return useQuery({
    queryKey: queryKeys.booking.schedulingGroups({
      cartVersion: input?.cartVersion ?? 0,
      addressId: input?.addressId ?? "",
    }),
    queryFn: async () =>
      (
        await request(() =>
          getApiClient().POST("/api/v1/cart/scheduling-groups/", {
            body: {
              address_id: input!.addressId,
              expected_cart_version: input!.cartVersion,
            },
          }),
        )
      ).groups,
    enabled: input !== null,
    ...VOLATILE_STATE,
  });
}
```

`useCreatePlanSet` changes only its body construction:

```ts
          body: {
            address_id: input.addressId,
            expected_cart_version: input.cartVersion,
            preferred_starts: input.preferredStarts.map((entry) => ({
              group_key: entry.groupKey,
              starts_at: entry.startsAt,
            })),
          },
```

`planSetIntentKey` in `features/booking/group/intents.ts` must include every start, or two different schedules replay to one plan set:

```ts
export function planSetIntentKey(input: CreatePlanSetInput): string {
  const starts = [...input.preferredStarts]
    .map((entry) => `${entry.groupKey}@${entry.startsAt}`)
    .sort()
    .join("|");
  return getStableIdempotencyKey(
    `plan-set:${input.cartVersion}:${input.addressId}:${starts}`,
  );
}
```

`features/cart/queries.ts`:

```ts
/**
 * Services one Partner could add to a visit this cart already has.
 *
 * Returns `[]` when nothing qualifies, and the view renders nothing for it. There
 * is deliberately no fallback list: the copy promises "same professional, same
 * visit", and a popular-services substitute would make that promise falsely.
 */
export function useCartSuggestions(cartVersion: number | null) {
  return useQuery({
    queryKey: queryKeys.booking.suggestions(cartVersion ?? 0),
    queryFn: async () =>
      (await request(() => getApiClient().POST("/api/v1/cart/suggestions/", { body: {} })))
        .suggestions,
    enabled: cartVersion !== null,
    ...SESSION_STATE,
  });
}
```

Move `useCart`, `useAddCartItem`, `useUpdateCartItem`, `useRemoveCartItem`, `useMergeCart`, `useApplyCart` and `useRefetchCartOnStaleVersion` verbatim into `features/cart/queries.ts`. Move `useCandidateStarts`, `usePlanSet`, `useCreatePlanQuote`, `usePlanQuote`, `useCreateCheckout` into `features/checkout/queries.ts`. Keep every docblock — they carry the cache and retry reasoning.

- [ ] **Step 4: Run**

```
cd frontend && pnpm vitest run apps/customer/features/cart apps/customer/features/checkout
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/customer/features/
git commit -m "feat(customer): split cart and checkout query layers"
```

---

### Task 7: `/cart` becomes a real cart page

**Files:**
- Create: `frontend/apps/customer/features/cart/view/cart-workspace.tsx`
- Create: `frontend/apps/customer/features/cart/view/cart-suggestions.tsx`
- Modify: `frontend/apps/customer/app/(flow)/cart/page.tsx`
- Test: `frontend/apps/customer/features/cart/view/cart-workspace.test.tsx`, `cart-suggestions.test.tsx`

**Interfaces:**
- Consumes: `useCart`, `useCartSuggestions`, `useUpdateCartItem`, `useRemoveCartItem`, `useMergeCart`, `useAddCartItem` (Task 6); existing `CartItems`, `CartVersionNote`, `MergeDialog`, `RemoveCartItemDialog`.
- Produces: `<CartWorkspace />` default-exported from the route.

- [ ] **Step 1: Write the failing test**

```tsx
it("sends an unauthenticated customer to log in, not to checkout", async () => {
  renderWithSession({ isAuthenticated: false, cart: twoItemCart });
  expect(await screen.findByRole("link", { name: /log in to continue/i })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /proceed to checkout/i })).not.toBeInTheDocument();
});

it("offers checkout once the customer is authenticated", async () => {
  renderWithSession({ isAuthenticated: true, cart: twoItemCart });
  expect(await screen.findByRole("link", { name: /proceed to checkout/i })).toHaveAttribute(
    "href",
    "/checkout",
  );
});

it("disables checkout for an empty cart", async () => {
  renderWithSession({ isAuthenticated: true, cart: emptyCart });
  expect(screen.queryByRole("link", { name: /proceed to checkout/i })).not.toBeInTheDocument();
  expect(await screen.findByText(/nothing in your cart yet/i)).toBeInTheDocument();
});

it("renders no suggestions section when the server returns none", async () => {
  renderWithSession({ isAuthenticated: true, cart: twoItemCart, suggestions: [] });
  await screen.findByRole("heading", { name: /your cart/i });
  expect(screen.queryByText(/same professional/i)).not.toBeInTheDocument();
});

it("adds a suggested service to the cart", async () => {
  const user = userEvent.setup();
  renderWithSession({ isAuthenticated: true, cart: twoItemCart, suggestions: [tapRepairCard] });
  await user.click(await screen.findByRole("button", { name: /add tap repair/i }));
  await waitFor(() => expect(addCartItemSpy).toHaveBeenCalled());
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd frontend && pnpm vitest run apps/customer/features/cart/view
```

Expected: FAIL — module not found.

- [ ] **Step 3: Build `cart-suggestions.tsx`**

```tsx
"use client";

/**
 * Services one professional could add to a visit this cart already has.
 *
 * The heading is a claim, and the server is what makes it true: every card here
 * carries an active `SAME_PARTNER_SEQUENTIAL` compatibility rule against
 * something already in the cart. That is the same rule the planner uses to merge
 * work into one unit, which is why adding one of these does not add a visit — and
 * therefore does not re-apply the per-visit minimum.
 *
 * Renders `null` when the list is empty. There is no fallback row: a cart with
 * nothing compatible has nothing to say here, and filling the space with popular
 * services would make the heading a lie.
 */
export function CartSuggestions({
  suggestions,
  isAdding,
  onAdd,
}: {
  suggestions: ServiceCard[];
  isAdding: string | null;
  onAdd: (card: ServiceCard) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <section aria-labelledby="suggestions-heading" className="mt-8">
      <h2 id="suggestions-heading" className="text-base font-bold text-text">
        Add to the same visit
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        The same professional can do these while they are with you — no second visit fee.
      </p>
      <ul className="mt-4 flex gap-3 overflow-x-auto pb-2">
        {suggestions.map((card) => (
          <li key={card.slug} className="w-56 shrink-0">
            <SuggestionCard
              card={card}
              isAdding={isAdding === card.slug}
              onAdd={() => onAdd(card)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Write `SuggestionCard` in the same file: image, name, "Starts at ₹X" from `card.starting_price` (use the exact field the generated `ServiceCard` type exposes — check `schema.d.ts`), and an `Add {name}` button. Use `next/image`, `max-w-full`, and give the `<ul>` `overflow-x-auto` so the page body never scrolls horizontally.

- [ ] **Step 4: Build `cart-workspace.tsx`**

Lift the `cart` branch of the old `workspace.tsx` verbatim — item list, `CartVersionNote`, `RemoveCartItemDialog`, `MergeDialog`, the version-conflict copy — and replace the `Continue` button with:

```tsx
{session.isAuthenticated ? (
  <Link href="/checkout" className={buttonStyles({})}>
    Proceed to checkout
  </Link>
) : (
  <Link
    href={`/login?next=${encodeURIComponent("/checkout")}`}
    className={buttonStyles({})}
  >
    Log in to continue
  </Link>
)}
```

Use the app's existing `next`-param convention — check `frontend/packages/query/src/next-path.ts` and follow it rather than inventing a query string.

Render `<CartSuggestions />` below the item list and above the totals.

- [ ] **Step 5: Point the route at it**

`app/(flow)/cart/page.tsx`: change the import and element to `CartWorkspace`. Keep the existing `metadata` block and its `robots: { index: false }` — and keep the docblock explaining why the route is not `force-dynamic`, which is still true.

- [ ] **Step 6: Run**

```
cd frontend && pnpm vitest run apps/customer/features/cart
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/apps/customer/features/cart/ frontend/apps/customer/app/
git commit -m "feat(customer): /cart becomes a cart page with compatible-service suggestions"
```

---

### Task 8: `/checkout` route with address and slots

**Files:**
- Create: `frontend/apps/customer/app/(flow)/checkout/page.tsx`
- Create: `frontend/apps/customer/features/checkout/view/checkout-workspace.tsx`
- Create: `frontend/apps/customer/features/checkout/view/slots-modal.tsx`
- Test: `frontend/apps/customer/features/checkout/view/slots-modal.test.tsx`, `checkout-workspace.test.tsx`

**Interfaces:**
- Consumes: `useSchedulingGroups`, `useCandidateStarts`, `useCreatePlanSet` (Task 6); existing `AddressStage`, `PreferredStartPicker`, `Dialog` from `@vsolve/ui`.
- Produces: `<CheckoutWorkspace />`; `<SlotsModal groups isOpen onConfirm onDismiss />`.

- [ ] **Step 1: Write the failing test**

```tsx
it("keeps Confirm disabled until every visit has a start", async () => {
  const user = userEvent.setup();
  render(<SlotsModal groups={[electricianGroup, salonGroup]} {...props} />);

  expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();

  await user.click(screen.getByRole("button", { name: /select.*electrician/i }));
  await user.click(await screen.findByRole("radio", { name: /9:00 am/i }));
  expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();

  await user.click(screen.getByRole("button", { name: /select.*salon/i }));
  await user.click(await screen.findByRole("radio", { name: /2:00 pm/i }));
  expect(screen.getByRole("button", { name: /confirm/i })).toBeEnabled();
});

it("shows one row per server group and never merges them itself", () => {
  render(<SlotsModal groups={[electricianGroup, salonGroup]} {...props} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

it("opens automatically once an address is chosen", async () => {
  const user = userEvent.setup();
  renderCheckout({ addresses: [home] });
  await user.click(await screen.findByRole("radio", { name: /home/i }));
  expect(await screen.findByRole("dialog", { name: /select slots/i })).toBeInTheDocument();
});

it("reopens the picker when the server says the grouping changed", async () => {
  createPlanSetSpy.mockRejectedValueOnce(apiError(409, "scheduling_groups_changed"));
  renderCheckout({ addresses: [home], groups: [electricianGroup] });
  // … choose a slot, confirm …
  expect(await screen.findByText(/choose your times again/i)).toBeInTheDocument();
  expect(await screen.findByRole("dialog", { name: /select slots/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd frontend && pnpm vitest run apps/customer/features/checkout/view
```

Expected: FAIL — module not found.

- [ ] **Step 3: Build `slots-modal.tsx`**

One `<li>` per group: label, `Service will take approx. {duration}`, and either a `Select` button or the chosen time with a `Change` button. Selecting a row swaps the modal body to the existing `PreferredStartPicker` scoped to that group, with a back control. `Confirm` is disabled until `chosen.size === groups.length`.

Accessibility, all required:
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the "Select slots" heading.
- Focus moves into the dialog on open and returns to the trigger on close.
- Escape dismisses; the page behind is inert.
- Use the `Dialog` primitive from `@vsolve/ui` if one exists — read `frontend/packages/ui/src` first and reuse `MergeDialog`'s pattern rather than hand-rolling a second modal.

State is `Map<groupKey, startsAt>` — keyed by the server's key, never by array index, so a re-fetched grouping cannot silently reassign a chosen time to a different visit.

- [ ] **Step 4: Build `checkout-workspace.tsx`**

Sections in order: Address (`AddressStage`, unchanged) → Slots (summary rows + Change, modal auto-opens on first address selection) → Review (plan set totals) → `Confirm booking`.

The confirm button reads **"Confirm booking"**, and beneath it: *"You will pay after we have assigned your professionals."* That sentence is load-bearing — it is the whole reason the button does not say Pay.

On `useCreatePlanSet` success, auto-select `plans.find((plan) => plan.is_recommended)`, create the quote, create the checkout, then `router.push(\`/bookings/${checkout.booking_group_id}\`)`.

Error handling:
- `scheduling_groups_changed` → invalidate `queryKeys.booking.schedulingGroups`, clear chosen starts, reopen the modal, show the server's message.
- `cart_version_conflict` → `router.push("/cart")` with the reloaded cart.
- Expired plan set → the existing `ErrorState` with "Work out fresh options".

Reuse `conflicts.ts` and `reasons.ts` unchanged; add a `schedulingGroupsChanged(error)` predicate to `conflicts.ts` beside `cartVersionConflict`.

- [ ] **Step 5: Create the route**

`app/(flow)/checkout/page.tsx`, mirroring the cart route's metadata block:

```tsx
export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutWorkspace />;
}
```

- [ ] **Step 6: Run**

```
cd frontend && pnpm vitest run apps/customer/features/checkout
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/apps/customer/features/checkout/ frontend/apps/customer/app/
git commit -m "feat(customer): /checkout with address and per-visit slot selection"
```

---

### Task 9: Assignment progress on `/bookings/[groupId]`

**Files:**
- Modify: `frontend/apps/customer/features/bookings/view/group-detail.tsx`
- Create: `frontend/apps/customer/features/bookings/view/assignment-progress.tsx`
- Test: `frontend/apps/customer/features/bookings/view/assignment-progress.test.tsx`

**Interfaces:**
- Consumes: the existing `useBookingGroup` poll and the `BookingGroup` projection (`status`, `units[].status`, `recovery_action`, `checkout_id`).
- Produces: `<AssignmentProgress group={group} />`.

- [ ] **Step 1: Write the failing test**

```tsx
it("shows a searching state per unit while matching", () => {
  render(<AssignmentProgress group={groupMatching} />);
  expect(screen.getByText(/finding your professionals/i)).toBeInTheDocument();
  expect(screen.getAllByText(/searching/i)).toHaveLength(2);
});

it("states the all-or-nothing rule while only some units are held", () => {
  render(<AssignmentProgress group={groupPartiallyHeld} />);
  expect(screen.getByText(/booked together or not at all/i)).toBeInTheDocument();
});

it("never shows a pay control before the server asks for payment", () => {
  render(<AssignmentProgress group={groupMatching} />);
  expect(screen.queryByRole("link", { name: /pay/i })).not.toBeInTheDocument();
});

it("shows the pay control and countdown only on PAYMENT_REQUIRED", () => {
  render(<AssignmentProgress group={groupPaymentPending} />);
  expect(screen.getByRole("link", { name: /pay now/i })).toBeInTheDocument();
  expect(screen.getByText(/held for/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

```
cd frontend && pnpm vitest run apps/customer/features/bookings
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Per-unit rows showing the unit's own `status`, with the group headline derived from the **server's** `status` and `recovery_action` only. The pay control stays gated exactly as it is today:

```tsx
{group.recovery_action === "PAYMENT_REQUIRED" && group.checkout_id !== null ? (
  <Link href={`/bookings/${group.id}/pay`} className={buttonStyles({})}>Pay now</Link>
) : null}
```

For the countdown use the existing `countdown` helper in `@vsolve/query` and `serverNow()` from `features/payment/queries.ts` — **never** `new Date()`. A wrong device clock must not hide a live payment window.

Render `<AssignmentProgress />` from `group-detail.tsx` in place of the current status paragraph, keeping `GroupStatusBadge` and the cancel control where they are.

- [ ] **Step 4: Run**

```
cd frontend && pnpm vitest run apps/customer/features/bookings
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/customer/features/bookings/
git commit -m "feat(customer): assignment progress as a first-class screen"
```

---

### Task 10: Delete the old workspace and verify end to end

**Files:**
- Delete: `frontend/apps/customer/features/booking/group/view/workspace.tsx`, `workspace.test.tsx`, `schedule-step.tsx` (after moving `PreferredStartPicker`), `plan-comparison.tsx`, `plan-comparison.test.tsx`, `group-login.tsx`
- Modify: `frontend/apps/customer/features/booking/group/` — remaining files move under `checkout/`
- Test: `frontend/e2e/` — add `cart-checkout.spec.ts`

- [ ] **Step 1: Move `PreferredStartPicker`**

Move it from `schedule-step.tsx` into `features/checkout/view/preferred-start-picker.tsx` **unchanged**, including its docblock about what the times do and do not promise. Delete `ScheduleStep` and `schedule-step.tsx`.

- [ ] **Step 2: Delete the superseded components**

Delete the files listed above. Then:

```
cd frontend && pnpm typecheck
```

Fix every unresolved import this surfaces. Expected: PASS when clean.

- [ ] **Step 3: Write the browser test**

`frontend/e2e/cart-checkout.spec.ts`:

```ts
test("two categories, two slots, confirm without paying", async ({ page }) => {
  await page.goto("/catalog/electrician/switch-socket-repair");
  await page.getByRole("button", { name: /add to cart/i }).click();
  await page.goto("/catalog/salon/waxing");
  await page.getByRole("button", { name: /add to cart/i }).click();

  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: /add to the same visit/i })).toBeVisible();
  await page.getByRole("link", { name: /proceed to checkout/i }).click();

  await page.getByRole("radio", { name: /home/i }).check();
  const dialog = page.getByRole("dialog", { name: /select slots/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(2);

  // Both visits get a time before Confirm enables.
  await expect(dialog.getByRole("button", { name: /^confirm$/i })).toBeDisabled();
  // … select a slot for each row …
  await dialog.getByRole("button", { name: /^confirm$/i }).click();

  await expect(page.getByRole("button", { name: /confirm booking/i })).toBeVisible();
  await expect(page.getByText(/pay after we have assigned/i)).toBeVisible();
  await page.getByRole("button", { name: /confirm booking/i }).click();

  await expect(page).toHaveURL(/\/bookings\//);
  await expect(page.getByText(/finding your professionals/i)).toBeVisible();
});
```

Adjust selectors to the seeded catalog — run `backend\scripts\server.cmd` and the seeder first and read the real slugs rather than guessing.

- [ ] **Step 4: Full gate, both sides**

```
cd backend && .\scripts\quality.cmd
cd frontend && pnpm verify
cd frontend && pnpm e2e
```

Expected: PASS. This is the one browser run for the whole plan.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(customer): remove the superseded booking wizard"
```

---

## Follow-on plan

Coupons (spec §4.5) are a separate subsystem — new `apps/promotions`, a money-envelope migration relaxing three CheckConstraints, and quote re-pricing. They get their own plan after this one lands: `docs/superpowers/plans/YYYY-MM-DD-promotions.md`.

## Self-Review

**Spec coverage:** §3.1 grouping → Tasks 1–2. §3.2 suggestions → Tasks 3, 7. §3.3 state handoff → Task 8. §4.1 → Task 2. §4.2 → Task 3. §4.3 → Task 4. §4.4 drift → Tasks 4, 8. §4.5 promotions → deferred to its own plan, stated above. §5.1 split → Tasks 6–8, 10. §5.2 modal → Task 9 of §5 → Task 8. §5.3 drop PlanComparison → Task 10. §5.4 assignment screen → Task 9. §5.5 login gate → Task 7. §6 edge cases → covered by the named tests in Tasks 1, 4, 8. §7 testing → each task's test steps plus Task 10's browser run.

**Placeholders:** none. Every code step carries real code; the three places that say "read the existing file first" name the exact file and what to take from it, because copying a pattern wrongly is the more likely failure than not knowing it exists.

**Type consistency:** `scheduling_group_key` / `SchedulingGroup` (Task 1) are used with the same names in Tasks 2 and 4. `preferred_starts` is a `Mapping[str, datetime]` in the service and a list of `{group_key, starts_at}` on the wire in Tasks 4 and 6 — the view converts between them, and both spellings appear in the code shown. `useSchedulingGroups` returns `.groups` (Task 6) and is consumed as an array in Task 8.
