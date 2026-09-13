"""Governance and RBAC administrative views for Phase 0 Enterprise Shell."""

from decimal import Decimal
from typing import cast
from django.db import models
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.permissions import HasAdminPermission
from apps.identity.models import (
    AdminAuditLog,
    AdminPermission,
    ConfigVersionHistory,
    DualAuthorizationRequest,
    Role,
    User,
    UserRole,
)


class AdminRoleListView(APIView):
    permission_classes = (IsAuthenticated, HasAdminPermission)
    required_permission = "sys_manage_rbac"

    @extend_schema(tags=["Admin Governance"])
    def get(self, request: Request) -> Response:
        roles = Role.objects.all().prefetch_related("permissions")
        results = []
        for role in roles:
            member_count = UserRole.objects.filter(role=role, revoked_at__isnull=True).count()
            results.append({
                "id": str(role.id),
                "code": role.code,
                "name": role.name,
                "description": role.description,
                "is_system": role.is_system,
                "member_count": member_count,
                "permission_count": role.permissions.count(),
                "permissions": [
                    {
                        "code": p.code,
                        "name": p.name,
                        "category": p.category,
                        "description": p.description,
                    }
                    for p in role.permissions.all()
                ],
            })
        return Response({"roles": results})


class AdminUserRoleListView(APIView):
    permission_classes = (IsAuthenticated, HasAdminPermission)
    required_permission = "sys_manage_rbac"

    @extend_schema(tags=["Admin Governance"])
    def get(self, request: Request) -> Response:
        active_grants = (
            UserRole.objects.filter(revoked_at__isnull=True)
            .select_related("user", "role")
            .order_by("user__phone_number")
        )
        users_map = {}
        for grant in active_grants:
            uid = str(grant.user.id)
            if uid not in users_map:
                users_map[uid] = {
                    "id": uid,
                    "phone_number": grant.user.phone_number,
                    "full_name": grant.user.full_name or grant.user.phone_number,
                    "email": grant.user.email,
                    "is_active": grant.user.is_active,
                    "roles": [],
                }
            users_map[uid]["roles"].append({
                "code": grant.role.code,
                "name": grant.role.name,
                "granted_at": grant.granted_at.isoformat(),
            })
        return Response({"users": list(users_map.values())})

    @extend_schema(tags=["Admin Governance"])
    def post(self, request: Request) -> Response:
        phone = request.data.get("phone_number")
        role_code = request.data.get("role_code")
        action = request.data.get("action", "ASSIGN").upper()
        if not phone or not role_code:
            return Response(
                {"error": "Both phone_number and role_code are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            target_user = User.objects.get(phone_number=phone)
            target_role = Role.objects.get(code=role_code)
        except (User.DoesNotExist, Role.DoesNotExist) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        if action == "REVOKE":
            UserRole.objects.filter(user=target_user, role=target_role, revoked_at__isnull=True).update(
                revoked_at=timezone.now(),
            )
            actor = cast(User, request.user)
            AdminAuditLog.objects.create(
                actor=actor,
                actor_phone=getattr(actor, "phone_number", "System"),
                actor_role="super_admin",
                target_entity_type="user_role",
                target_entity_id=f"{target_user.id}_{target_role.id}",
                action_type=AdminAuditLog.ActionType.DELETE,
                summary=f"Role '{role_code}' revoked from {phone}",
                new_value_json={"phone": phone, "role": role_code, "action": "REVOKE"},
            )
            return Response({"status": "ok", "action": "REVOKED"})

        grant, created = UserRole.objects.get_or_create(
            user=target_user,
            role=target_role,
            revoked_at=None,
            defaults={"granted_by": cast(User, request.user)},
        )

        # Audit write
        actor = cast(User, request.user)
        AdminAuditLog.objects.create(
            actor=actor,
            actor_phone=getattr(actor, "phone_number", "System"),
            actor_role="super_admin",
            target_entity_type="user_role",
            target_entity_id=str(grant.id),
            action_type=AdminAuditLog.ActionType.CREATE if created else AdminAuditLog.ActionType.UPDATE,
            summary=f"Role '{role_code}' assigned to {phone}",
            new_value_json={"phone": phone, "role": role_code},
        )

        return Response({"status": "ok", "created": created})


class AdminAuditLogListView(APIView):
    permission_classes = (IsAuthenticated, HasAdminPermission)
    required_permission = "sys_view_audit_logs"

    @extend_schema(tags=["Admin Governance"])
    def get(self, request: Request) -> Response:
        action_type = request.query_params.get("action_type")
        entity_type = request.query_params.get("entity_type")
        search = request.query_params.get("search")

        qs = AdminAuditLog.objects.all().select_related("actor")
        if action_type:
            qs = qs.filter(action_type=action_type.upper())
        if entity_type:
            qs = qs.filter(target_entity_type__icontains=entity_type)
        if search:
            qs = qs.filter(summary__icontains=search)

        logs = qs[:50]
        results = [
            {
                "id": str(log.id),
                "actor_phone": log.actor_phone or (getattr(log.actor, "phone_number", "System") if log.actor else "System"),
                "actor_role": log.actor_role or "system",
                "target_entity_type": log.target_entity_type,
                "target_entity_id": log.target_entity_id,
                "action_type": log.action_type,
                "summary": log.summary,
                "old_value": log.old_value_json,
                "new_value": log.new_value_json,
                "timestamp": log.timestamp.isoformat(),
            }
            for log in logs
        ]
        return Response({"logs": results, "total": qs.count()})


class DualAuthPendingListView(APIView):
    permission_classes = (IsAuthenticated, HasAdminPermission)
    required_permission = "cmd_manage_approvals"

    @extend_schema(tags=["Admin Governance"])
    def get(self, request: Request) -> Response:
        pending = DualAuthorizationRequest.objects.filter(
            status=DualAuthorizationRequest.Status.PENDING
        ).select_related("requester", "first_approver")

        results = [
            {
                "id": str(req.id),
                "title": req.title,
                "description": req.description,
                "action_type": req.action_type,
                "requester_phone": getattr(req.requester, "phone_number", "") if req.requester else "",
                "created_at": req.created_at.isoformat(),
                "expires_at": req.expires_at.isoformat(),
                "payload": req.payload,
                "status": req.status,
            }
            for req in pending
        ]
        return Response({"pending_requests": results, "count": len(results)})


class DualAuthApproveView(APIView):
    permission_classes = (IsAuthenticated, HasAdminPermission)
    required_permission = "sys_dual_auth_approve"

    @extend_schema(tags=["Admin Governance"])
    def post(self, request: Request, request_id: str) -> Response:
        try:
            dual_req = DualAuthorizationRequest.objects.get(id=request_id)
        except DualAuthorizationRequest.DoesNotExist:
            return Response({"error": "Request not found"}, status=status.HTTP_404_NOT_FOUND)

        if dual_req.status != DualAuthorizationRequest.Status.PENDING:
            return Response(
                {"error": f"Request is already {dual_req.status}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_user = cast(User, request.user)
        if dual_req.requester == current_user:
            return Response(
                {"error": "Four-eyes policy violation: requester cannot approve their own high-risk action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        action = request.data.get("action", "APPROVE")
        if action == "REJECT":
            dual_req.status = DualAuthorizationRequest.Status.REJECTED
            dual_req.rejected_by = current_user
            dual_req.rejected_at = timezone.now()
            dual_req.rejection_reason = request.data.get("reason", "Rejected by administrator")
            dual_req.save()
            return Response({"status": "rejected"})

        if not dual_req.first_approver:
            dual_req.first_approver = current_user
            dual_req.first_approved_at = timezone.now()
            dual_req.status = DualAuthorizationRequest.Status.APPROVED
            dual_req.save()
            return Response({"status": "approved_step_1"})
        elif dual_req.first_approver != current_user:
            dual_req.second_approver = current_user
            dual_req.second_approved_at = timezone.now()
            dual_req.status = DualAuthorizationRequest.Status.EXECUTED
            dual_req.save()
            return Response({"status": "fully_executed"})

        return Response({"error": "Second approval must be by a different user"}, status=status.HTTP_400_BAD_REQUEST)


class ConfigVersionListView(APIView):
    permission_classes = (IsAuthenticated, HasAdminPermission)
    required_permission = "sys_manage_system"

    @extend_schema(tags=["Admin Governance"])
    def get(self, request: Request) -> Response:
        versions = ConfigVersionHistory.objects.all().select_related("created_by")[:30]
        results = [
            {
                "id": str(v.id),
                "config_key": v.config_key,
                "version_number": v.version_number,
                "change_summary": v.change_summary,
                "created_by": getattr(v.created_by, "phone_number", "System") if v.created_by else "System",
                "created_at": v.created_at.isoformat(),
                "is_active": v.is_active,
                "snapshot": v.schema_snapshot,
            }
            for v in versions
        ]
        return Response({"versions": results})


class AdminCustomerListView(APIView):
    permission_classes = (IsAuthenticated, HasAdminPermission)
    required_permission = "users_view_customers"

    @extend_schema(tags=["Admin Customers"])
    def get(self, request: Request) -> Response:
        from apps.identity.models import CustomerProfile

        search = request.query_params.get("search")
        status_filter = request.query_params.get("status")

        qs = CustomerProfile.objects.all().select_related("user").order_by("-created_at")
        if status_filter:
            qs = qs.filter(account_status=status_filter.upper())
        if search:
            qs = qs.filter(
                models.Q(user__phone_number__icontains=search)
                | models.Q(display_name__icontains=search)
                | models.Q(referral_code__icontains=search)
            )

        customers = [
            {
                "id": str(c.id),
                "user_id": str(c.user.id),
                "phone_number": c.user.phone_number,
                "display_name": c.display_name or c.user.full_name or c.user.phone_number,
                "is_student_verified": c.is_student_verified,
                "referral_code": c.referral_code,
                "v_coins_balance": c.v_coins_balance,
                "account_status": c.account_status,
                "created_at": c.created_at.isoformat(),
            }
            for c in qs[:50]
        ]
        return Response({"customers": customers, "total": qs.count()})


class AdminCustomerActionView(APIView):
    permission_classes = (IsAuthenticated, HasAdminPermission)
    required_permission = "users_edit_customers"

    @extend_schema(tags=["Admin Customers"])
    def post(self, request: Request, customer_id: str) -> Response:
        from apps.identity.models import CustomerProfile

        try:
            profile = CustomerProfile.objects.select_related("user").get(id=customer_id)
        except CustomerProfile.DoesNotExist:
            return Response({"error": "Customer not found"}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get("action")  # "ACTIVATE", "SUSPEND", "ADJUST_VCOINS", "VERIFY_STUDENT"
        if action == "SUSPEND":
            profile.account_status = CustomerProfile.AccountStatus.SUSPENDED
            profile.user.is_active = False
            profile.user.save(update_fields=["is_active"])
            profile.save(update_fields=["account_status"])
        elif action == "ACTIVATE":
            profile.account_status = CustomerProfile.AccountStatus.ACTIVE
            profile.user.is_active = True
            profile.user.save(update_fields=["is_active"])
            profile.save(update_fields=["account_status"])
        elif action == "ADJUST_VCOINS":
            delta = int(request.data.get("delta", 0))
            profile.v_coins_balance = max(0, profile.v_coins_balance + delta)
            profile.save(update_fields=["v_coins_balance"])
        elif action == "VERIFY_STUDENT":
            profile.is_student_verified = not profile.is_student_verified
            profile.save(update_fields=["is_student_verified"])

        # Write audit log
        actor = cast(User, request.user)
        AdminAuditLog.objects.create(
            actor=actor,
            actor_phone=getattr(actor, "phone_number", "System"),
            actor_role="super_admin",
            target_entity_type="customer",
            target_entity_id=str(profile.id),
            action_type=AdminAuditLog.ActionType.UPDATE,
            summary=f"Customer {getattr(profile.user, 'phone_number', profile.id)} action: {action}",
            new_value_json={
                "status": profile.account_status,
                "v_coins": profile.v_coins_balance,
                "student_verified": profile.is_student_verified,
            },
        )

        return Response({
            "status": "ok",
            "account_status": profile.account_status,
            "v_coins_balance": profile.v_coins_balance,
            "is_student_verified": profile.is_student_verified,
        })


class AdminPartnerListView(APIView):
    permission_classes = (IsAuthenticated, HasAdminPermission)
    required_permission = "users_view_partners"

    @extend_schema(tags=["Admin Partners"])
    def get(self, request: Request) -> Response:
        from apps.partners.models import PartnerProfile

        persona = request.query_params.get("persona")
        tier = request.query_params.get("tier")
        search = request.query_params.get("search")

        qs = PartnerProfile.objects.all().select_related("user").order_by("-created_at")
        if persona:
            qs = qs.filter(provider_type=persona.upper())
        if tier:
            qs = qs.filter(tier=tier.upper())
        if search:
            qs = qs.filter(
                models.Q(display_name__icontains=search)
                | models.Q(user__phone_number__icontains=search)
            )

        partners = [
            {
                "id": str(p.id),
                "user_id": str(p.user_id),
                "phone_number": p.user.phone_number,
                "display_name": p.display_name,
                "provider_type": p.provider_type,
                "tier": p.tier,
                "biography": p.biography,
                "experience_years": p.experience_years,
                "is_verified": p.is_verified,
                "created_at": p.created_at.isoformat(),
            }
            for p in qs[:50]
        ]
        return Response({"partners": partners, "total": qs.count()})


class AdminZoneListView(APIView):
    permission_classes = (IsAuthenticated, HasAdminPermission)
    required_permission = "cmd_view_live_ops"

    @extend_schema(tags=["Admin Locations"])
    def get(self, request: Request) -> Response:
        from apps.locations.models import CityZone

        if not CityZone.objects.exists():
            seed_data = [
                {"country_code": "IN", "state_name": "Telangana", "city_name": "Hyderabad", "zone_name": "Zone 1 - West IT Corridor", "area_name": "HITEC City / Madhapur", "pincode": "500081", "service_radius_km": 8, "pricing_multiplier": 1.15, "is_active": True, "is_accepting_partners": True},
                {"country_code": "IN", "state_name": "Telangana", "city_name": "Hyderabad", "zone_name": "Zone 1 - West IT Corridor", "area_name": "Gachibowli / Financial District", "pincode": "500032", "service_radius_km": 10, "pricing_multiplier": 1.15, "is_active": True, "is_accepting_partners": True},
                {"country_code": "IN", "state_name": "Telangana", "city_name": "Hyderabad", "zone_name": "Zone 2 - Central Commercial", "area_name": "Jubilee Hills / Banjara Hills", "pincode": "500033", "service_radius_km": 7, "pricing_multiplier": 1.20, "is_active": True, "is_accepting_partners": True},
                {"country_code": "IN", "state_name": "Telangana", "city_name": "Hyderabad", "zone_name": "Zone 3 - North Residential", "area_name": "Kukatpally / KPHB Colony", "pincode": "500072", "service_radius_km": 9, "pricing_multiplier": 1.00, "is_active": True, "is_accepting_partners": True},
                {"country_code": "IN", "state_name": "Telangana", "city_name": "Hyderabad", "zone_name": "Zone 4 - East Heritage", "area_name": "Secunderabad / Marredpally", "pincode": "500026", "service_radius_km": 8, "pricing_multiplier": 1.05, "is_active": True, "is_accepting_partners": True},
                {"country_code": "IN", "state_name": "Telangana", "city_name": "Warangal", "zone_name": "Zone 1 - Urban Hub", "area_name": "Hanamkonda / Kazipet", "pincode": "506001", "service_radius_km": 12, "pricing_multiplier": 0.90, "is_active": True, "is_accepting_partners": True},
            ]
            for item in seed_data:
                CityZone.objects.create(**item)

        zones = CityZone.objects.all().order_by("city_name", "zone_name")
        results = [
            {
                "id": str(z.id),
                "country": z.country_code,
                "state": z.state_name,
                "city": z.city_name,
                "zone": z.zone_name,
                "area": z.area_name,
                "pincode": z.pincode,
                "service_radius_km": z.service_radius_km,
                "is_active": z.is_active,
                "is_accepting_partners": z.is_accepting_partners,
                "pricing_multiplier": float(z.pricing_multiplier),
            }
            for z in zones
        ]
        return Response({"zones": results, "total": len(results)})

    @extend_schema(tags=["Admin Locations"])
    def post(self, request: Request) -> Response:
        from apps.locations.models import CityZone

        data = request.data
        action = data.get("action", "UPDATE").upper()
        actor = cast(User, request.user)

        if action == "CREATE":
            zone = CityZone.objects.create(
                country_code=data.get("country_code", "IN"),
                state_name=data.get("state_name", "Telangana"),
                city_name=data.get("city_name", "Hyderabad"),
                zone_name=data.get("zone_name", "Zone New"),
                area_name=data.get("area_name", ""),
                pincode=data.get("pincode", "500001"),
                service_radius_km=int(data.get("service_radius_km", 10)),
                pricing_multiplier=Decimal(str(data.get("pricing_multiplier", 1.0))),
                is_active=bool(data.get("is_active", True)),
                is_accepting_partners=bool(data.get("is_accepting_partners", True)),
            )
            AdminAuditLog.objects.create(
                actor=actor,
                actor_phone=getattr(actor, "phone_number", "System"),
                actor_role="super_admin",
                target_entity_type="CityZone",
                target_entity_id=str(zone.id),
                action_type="CREATE",
                summary=f"Created geospatial service zone: {zone.area_name} ({zone.pincode})",
                new_value_json={"city": zone.city_name, "zone": zone.zone_name, "pincode": zone.pincode},
            )
            return Response({"status": "SUCCESS", "message": "Service zone created successfully", "id": str(zone.id)})

        # UPDATE action
        zone_id = data.get("zone_id") or data.get("id")
        try:
            zone = CityZone.objects.get(id=zone_id)
        except CityZone.DoesNotExist:
            return Response({"error": f"Zone {zone_id} not found"}, status=status.HTTP_404_NOT_FOUND)

        old_val = {
            "pricing_multiplier": float(zone.pricing_multiplier),
            "service_radius_km": zone.service_radius_km,
            "is_active": zone.is_active,
            "is_accepting_partners": zone.is_accepting_partners,
        }

        if "pricing_multiplier" in data:
            zone.pricing_multiplier = Decimal(str(data["pricing_multiplier"]))
        if "service_radius_km" in data:
            zone.service_radius_km = int(data["service_radius_km"])
        if "is_active" in data:
            zone.is_active = bool(data["is_active"])
        if "is_accepting_partners" in data:
            zone.is_accepting_partners = bool(data["is_accepting_partners"])
        zone.save()

        AdminAuditLog.objects.create(
            actor=actor,
            actor_phone=getattr(actor, "phone_number", "System"),
            actor_role="super_admin",
            target_entity_type="CityZone",
            target_entity_id=str(zone.id),
            action_type="UPDATE",
            summary=f"Updated service zone configuration: {zone.area_name} ({zone.pincode})",
            old_value_json=old_val,
            new_value_json={
                "pricing_multiplier": float(zone.pricing_multiplier),
                "service_radius_km": zone.service_radius_km,
                "is_active": zone.is_active,
                "is_accepting_partners": zone.is_accepting_partners,
            },
        )
        return Response({"status": "SUCCESS", "message": "Zone updated successfully"})


