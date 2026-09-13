"use client";

import React, { useState, useEffect } from "react";
import { Badge, Button, Card, Spinner } from "@vsolve/ui";
import {
  ShieldAlert,
  KeyRound,
  Check,
  Search,
  RefreshCw,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface RoleData {
  id: string;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  member_count: number;
  permission_count: number;
  permissions: {
    code: string;
    name: string;
    category: string;
    description: string;
  }[];
}

interface StaffUser {
  id: string;
  phone_number: string;
  full_name: string;
  email: string;
  is_active: boolean;
  roles: {
    code: string;
    name: string;
    granted_at: string;
  }[];
}

const CANONICAL_CATEGORIES = [
  "COMMAND_CENTER",
  "USERS",
  "MARKETPLACE",
  "MONEY",
  "GROWTH",
  "SERVICES",
  "SUPPORT",
  "AI",
  "ANALYTICS",
  "SYSTEM",
];

export default function AdminUsersPage() {
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<RoleData | null>(null);
  const [activeTab, setActiveTab] = useState<"roles" | "users">("roles");
  const [searchQuery, setSearchQuery] = useState("");
  const [grantModalUser, setGrantModalUser] = useState<StaffUser | null>(null);
  const [roleToGrant, setRoleToGrant] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchRbacData = async () => {
    setLoading(true);
    try {
      const [rolesRes, usersRes] = await Promise.all([
        adminFetch("/api/v1/admin/roles/"),
        adminFetch("/api/v1/admin/users/"),
      ]);
      if (rolesRes.ok) {
        const data = await rolesRes.json();
        setRoles(data.roles || []);
        if (data.roles?.length > 0 && !selectedRole) {
          setSelectedRole(data.roles[0]);
        }
      }
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users || []);
      }
    } catch (e) {
      console.error("Failed to load RBAC data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRbacData();
  }, []);

  const handleGrantRole = async () => {
    if (!grantModalUser || !roleToGrant) return;
    setIsSubmitting(true);
    try {
      const res = await adminFetch("/api/v1/admin/users/", {
        method: "POST",
        body: JSON.stringify({
          phone_number: grantModalUser.phone_number,
          role_code: roleToGrant,
          action: "ASSIGN",
        }),
      });
      if (res.ok) {
        await fetchRbacData();
        // Update currently open modal state
        const updatedUser = users.find((u) => u.id === grantModalUser.id);
        if (updatedUser) {
          setGrantModalUser({
            ...updatedUser,
            roles: [
              ...grantModalUser.roles,
              {
                code: roleToGrant,
                name: roles.find((r) => r.code === roleToGrant)?.name || roleToGrant,
                granted_at: new Date().toISOString(),
              },
            ],
          });
        }
        setRoleToGrant("");
      } else {
        alert("Failed to assign role");
      }
    } catch (e) {
      console.error(e);
      alert("Error assigning role");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeRole = async (roleCode: string) => {
    if (!grantModalUser) return;
    if (!confirm(`Are you sure you want to revoke role '${roleCode}' from ${grantModalUser.full_name}?`)) return;
    setIsSubmitting(true);
    try {
      const res = await adminFetch("/api/v1/admin/users/", {
        method: "POST",
        body: JSON.stringify({
          phone_number: grantModalUser.phone_number,
          role_code: roleCode,
          action: "REVOKE",
        }),
      });
      if (res.ok) {
        setGrantModalUser({
          ...grantModalUser,
          roles: grantModalUser.roles.filter((r) => r.code !== roleCode),
        });
        await fetchRbacData();
      } else {
        alert("Failed to revoke role");
      }
    } catch (e) {
      console.error(e);
      alert("Error revoking role");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-warm-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-6 w-6 text-[#FF6500]" />
            <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
              Admin Users & Role Management (RBAC)
            </h1>
          </div>
          <p className="text-sm text-warm-700 mt-1">
            Configure 12 administrative roles, granular authorization matrices, and view staff access grants.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-warm-200/80 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab("roles")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "roles"
                  ? "bg-white text-navy-900 shadow-xs"
                  : "text-warm-700 hover:text-navy-900"
              }`}
            >
              12 Roles & Matrix
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "users"
                  ? "bg-white text-navy-900 shadow-xs"
                  : "text-warm-700 hover:text-navy-900"
              }`}
            >
              Staff Directory ({users.length})
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRbacData}
            className="flex items-center gap-1.5 text-xs border-warm-300 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16 gap-3 text-warm-700">
          <Spinner size="md" />
          <span>Loading RBAC authorization matrix…</span>
        </div>
      ) : activeTab === "roles" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Roles List (Left Col) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="text-xs font-bold uppercase tracking-wider text-warm-600 px-1">
              Platform Roles ({roles.length})
            </div>
            <div className="flex flex-col gap-2">
              {roles.map((r) => {
                const isSelected = selectedRole?.code === r.code;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRole(r)}
                    className={`p-3.5 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#0B192C] text-white border-[#0B192C] shadow-md"
                        : "bg-white border-warm-200 hover:border-warm-400 text-navy-900"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <KeyRound
                          className={`h-4 w-4 ${isSelected ? "text-[#FF6500]" : "text-warm-500"}`}
                        />
                        <span className="font-bold text-sm">{r.name}</span>
                      </div>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
                          isSelected
                            ? "bg-[#1E3E62] text-gray-200"
                            : "bg-warm-100 text-warm-700"
                        }`}
                      >
                        {r.code}
                      </span>
                    </div>
                    <p
                      className={`text-xs mt-1 line-clamp-2 ${
                        isSelected ? "text-gray-300" : "text-warm-600"
                      }`}
                    >
                      {r.description}
                    </p>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-700/20 text-xs">
                      <span className={isSelected ? "text-gray-400" : "text-warm-500"}>
                        {r.permission_count} permissions active
                      </span>
                      <span className={isSelected ? "text-emerald-400 font-semibold" : "text-navy-700 font-semibold"}>
                        {r.member_count} assigned staff
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Role Details & Permissions Matrix (Right Col) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            {selectedRole ? (
              <Card className="p-6 border border-warm-200 bg-white shadow-xs">
                <div className="flex items-center justify-between border-b border-warm-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-navy-900">{selectedRole.name}</h2>
                      <span className="px-2 py-0.5 bg-warm-100 text-warm-700 rounded text-xs font-mono">
                        {selectedRole.code}
                      </span>
                    </div>
                    <p className="text-xs text-warm-600 mt-1">{selectedRole.description}</p>
                  </div>
                  <Badge tone={selectedRole.is_system ? "neutral" : "info"}>
                    {selectedRole.is_system ? "System Built-in" : "Custom Role"}
                  </Badge>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-warm-700">
                      Granted Permissions ({selectedRole.permissions.length})
                    </h3>
                    <span className="text-xs text-warm-500">
                      Action matrix across 10 functional verticals
                    </span>
                  </div>

                  <div className="flex flex-col gap-4 max-h-[550px] overflow-y-auto pr-1">
                    {CANONICAL_CATEGORIES.map((cat) => {
                      const permsInCat = selectedRole.permissions.filter(
                        (p) => p.category === cat
                      );
                      if (permsInCat.length === 0) return null;

                      return (
                        <div key={cat} className="border border-warm-200 rounded-lg p-3 bg-warm-50/50">
                          <div className="text-[11px] font-bold text-navy-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-[#FF6500]"></span>
                            {cat} ({permsInCat.length})
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {permsInCat.map((perm) => (
                              <div
                                key={perm.code}
                                className="flex items-start gap-2 bg-white p-2 rounded border border-warm-200 text-xs"
                              >
                                <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                <div className="flex flex-col">
                                  <span className="font-semibold text-navy-900">
                                    {perm.name}
                                  </span>
                                  <span className="text-[11px] text-warm-500 font-mono">
                                    {perm.code}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            ) : (
              <div className="flex items-center justify-center p-12 text-warm-600 border border-dashed border-warm-300 rounded-lg">
                Select a role to inspect its permissions matrix
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Staff Directory Table */
        <Card className="p-5 border border-warm-200 bg-white shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-navy-900">Assigned Staff Directory</h2>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-warm-400" />
              <input
                type="text"
                placeholder="Search staff by phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-warm-300 rounded-md text-xs focus:outline-none focus:border-[#FF6500]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-warm-200 bg-warm-50/80 text-warm-700 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Staff Phone</th>
                  <th className="py-2.5 px-3">Display Name</th>
                  <th className="py-2.5 px-3">Active Roles</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-200">
                {users
                  .filter((u) => u.phone_number.includes(searchQuery))
                  .map((user) => (
                    <tr key={user.id} className="hover:bg-warm-50/50">
                      <td className="py-3 px-3 font-mono font-semibold text-navy-900">
                        {user.phone_number}
                      </td>
                      <td className="py-3 px-3 font-medium text-navy-900">
                        {user.full_name}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1.5">
                          {user.roles.map((r) => (
                            <span
                              key={r.code}
                              className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#0B192C] text-white"
                            >
                              {r.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                          Active
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setGrantModalUser(user)}
                          className="text-xs text-navy-700 hover:text-[#FF6500] cursor-pointer"
                        >
                          Edit Grants
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Edit Grants Modal */}
      {grantModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-[#0B192C]">
                  Role Grants: {grantModalUser.full_name}
                </h3>
                <p className="text-xs text-gray-500 font-mono">{grantModalUser.phone_number}</p>
              </div>
              <button
                onClick={() => setGrantModalUser(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                  Currently Assigned Roles ({grantModalUser.roles.length})
                </h4>
                {grantModalUser.roles.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No roles currently assigned.</p>
                ) : (
                  <div className="space-y-2">
                    {grantModalUser.roles.map((r) => (
                      <div
                        key={r.code}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 bg-gray-50"
                      >
                        <div>
                          <div className="font-semibold text-xs text-[#0B192C]">{r.name}</div>
                          <div className="text-[10px] text-gray-500 font-mono">{r.code}</div>
                        </div>
                        <button
                          disabled={isSubmitting}
                          onClick={() => handleRevokeRole(r.code)}
                          className="text-red-500 hover:text-red-700 text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                  Assign Additional Role
                </h4>
                <div className="flex gap-2">
                  <select
                    value={roleToGrant}
                    onChange={(e) => setRoleToGrant(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6500]"
                  >
                    <option value="">Select a role to grant...</option>
                    {roles
                      .filter((r) => !grantModalUser.roles.some((gr) => gr.code === r.code))
                      .map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.name} ({r.code})
                        </option>
                      ))}
                  </select>
                  <button
                    disabled={!roleToGrant || isSubmitting}
                    onClick={handleGrantRole}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Assign
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                type="button"
                onClick={() => setGrantModalUser(null)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
