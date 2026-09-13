"use client";

import React, { useState, useEffect } from "react";
import { Badge, Button, Card, Spinner } from "@vsolve/ui";
import {
  UserCheck,
  Search,
  RefreshCw,
  Coins,
  GraduationCap,
  Ban,
  CheckCircle2,
  AlertTriangle,
  History,
  Phone,
  ShieldCheck,
  PlusCircle,
  MinusCircle,
  Eye,
} from "lucide-react";

import { adminFetch } from "@/lib/api/admin-fetch";

interface CustomerRecord {
  id: string;
  user_id: string;
  phone_number: string;
  display_name: string;
  is_student_verified: boolean;
  referral_code: string;
  v_coins_balance: number;
  account_status: "ACTIVE" | "SUSPENDED" | "BLACKLISTED";
  created_at: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [vCoinsDelta, setVCoinsDelta] = useState(50);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (statusFilter) params.set("status", statusFilter);

      const res = await adminFetch(`/api/v1/admin/customers/?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || []);
      }
    } catch (e) {
      console.error("Failed to load customer list", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [statusFilter]);

  const handleCustomerAction = async (customerId: string, action: string, delta = 0) => {
    setActionInProgress(true);
    setNotice(null);
    try {
      const res = await adminFetch(`/api/v1/admin/customers/${customerId}/action/`, {
        method: "POST",
        body: JSON.stringify({ action, delta }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotice(`Action '${action}' applied successfully.`);
        if (selectedCustomer && selectedCustomer.id === customerId) {
          setSelectedCustomer((prev) =>
            prev
              ? {
                  ...prev,
                  account_status: data.account_status,
                  v_coins_balance: data.v_coins_balance,
                  is_student_verified: data.is_student_verified,
                }
              : null
          );
        }
        fetchCustomers();
      } else {
        setNotice("Failed to execute action on customer account.");
      }
    } catch (e) {
      setNotice("Network error while communicating with customer service.");
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-warm-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <UserCheck className="h-6 w-6 text-[#FF6500]" />
            <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
              Customer 360° Management
            </h1>
          </div>
          <p className="text-sm text-warm-700 mt-1">
            Complete customer identities, student verification, V Coins ledger balances, and security controls.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge tone="info" className="font-mono text-xs">
            {customers.length} Accounts Listed
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCustomers}
            className="flex items-center gap-1.5 text-xs border-warm-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs font-semibold flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-emerald-700 font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <Card className="p-4 border border-warm-200 bg-white shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-warm-400" />
            <input
              type="text"
              placeholder="Search by phone (+91...), customer name, or referral code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchCustomers()}
              className="w-full pl-8 pr-3 py-1.5 border border-warm-300 rounded-md text-xs focus:outline-none focus:border-[#FF6500]"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-1.5 border border-warm-300 rounded-md text-xs bg-white text-navy-900 focus:outline-none focus:border-[#FF6500]"
            >
              <option value="">All Account Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="BLACKLISTED">BLACKLISTED</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Main Content: Table & 360 Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={selectedCustomer ? "lg:col-span-7" : "lg:col-span-12"}>
          <Card className="border border-warm-200 bg-white shadow-xs overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center p-16 gap-3 text-warm-700">
                <Spinner size="md" />
                <span>Loading customer accounts…</span>
              </div>
            ) : customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-warm-600">
                <UserCheck className="h-10 w-10 text-warm-400 mb-2" />
                <p className="font-semibold text-sm">No customers found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-warm-200 bg-warm-50/80 text-warm-700 font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Student Status</th>
                      <th className="py-2.5 px-3">V Coins</th>
                      <th className="py-2.5 px-3">Account Status</th>
                      <th className="py-2.5 px-3 text-right">360° Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200">
                    {customers.map((c) => (
                      <tr
                        key={c.id}
                        className={`hover:bg-warm-50/50 cursor-pointer ${
                          selectedCustomer?.id === c.id ? "bg-warm-100/60" : ""
                        }`}
                        onClick={() => setSelectedCustomer(c)}
                      >
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-bold text-navy-900">{c.display_name}</span>
                            <span className="font-mono text-warm-500 text-[11px]">
                              {c.phone_number}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {c.is_student_verified ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[11px] font-semibold border border-emerald-200">
                              <GraduationCap className="h-3.5 w-3.5" />
                              Verified Student
                            </span>
                          ) : (
                            <span className="text-warm-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1 font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 w-fit">
                            <Coins className="h-3.5 w-3.5 text-amber-600" />
                            <span>{c.v_coins_balance}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <Badge
                            tone={
                              c.account_status === "ACTIVE"
                                ? "info"
                                : c.account_status === "SUSPENDED"
                                ? "warning"
                                : "danger"
                            }
                          >
                            {c.account_status}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomer(c);
                            }}
                            className="text-xs"
                          >
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* 360 Detail Card */}
        {selectedCustomer && (
          <div className="lg:col-span-5">
            <Card className="p-5 border border-warm-300 bg-white shadow-md flex flex-col gap-4 sticky top-20">
              <div className="flex items-center justify-between border-b border-warm-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-full bg-[#0B192C] text-white flex items-center justify-center font-bold text-sm">
                    {selectedCustomer.display_name.charAt(0)}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-base text-navy-900">
                      {selectedCustomer.display_name}
                    </span>
                    <span className="text-xs font-mono text-warm-500">
                      {selectedCustomer.phone_number}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-warm-400 hover:text-navy-900 text-lg font-bold"
                >
                  ×
                </button>
              </div>

              {/* Status & Wallet Grid */}
              <div className="grid grid-cols-2 gap-3 bg-warm-50 p-3 rounded-lg text-xs">
                <div>
                  <span className="text-warm-500 block text-[11px]">Account Status</span>
                  <Badge
                    tone={
                      selectedCustomer.account_status === "ACTIVE"
                        ? "info"
                        : selectedCustomer.account_status === "SUSPENDED"
                        ? "warning"
                        : "danger"
                    }
                  >
                    {selectedCustomer.account_status}
                  </Badge>
                </div>
                <div>
                  <span className="text-warm-500 block text-[11px]">V Coins Balance</span>
                  <span className="font-bold text-navy-900 text-sm flex items-center gap-1">
                    <Coins className="h-4 w-4 text-amber-600" />
                    {selectedCustomer.v_coins_balance} Coins
                  </span>
                </div>
                <div>
                  <span className="text-warm-500 block text-[11px]">Student Status</span>
                  <span className="font-medium text-navy-900">
                    {selectedCustomer.is_student_verified ? "Verified Student" : "Regular Account"}
                  </span>
                </div>
                <div>
                  <span className="text-warm-500 block text-[11px]">Referral Origin</span>
                  <span className="font-mono text-navy-900">
                    {selectedCustomer.referral_code || "Direct Organic"}
                  </span>
                </div>
              </div>

              {/* V Coins Management */}
              <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-3">
                <span className="text-xs font-bold text-amber-900 block mb-1.5 flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5 text-amber-700" />
                  V Coins Manual Adjustment
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={vCoinsDelta}
                    onChange={(e) => setVCoinsDelta(Number(e.target.value))}
                    className="w-20 px-2 py-1 text-xs border border-warm-300 rounded bg-white text-navy-900 font-mono"
                  />
                  <Button
                    size="sm"
                    onClick={() =>
                      handleCustomerAction(selectedCustomer.id, "ADJUST_VCOINS", vCoinsDelta)
                    }
                    loading={actionInProgress}
                    className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1"
                  >
                    <PlusCircle className="h-3 w-3" />
                    Credit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      handleCustomerAction(selectedCustomer.id, "ADJUST_VCOINS", -vCoinsDelta)
                    }
                    loading={actionInProgress}
                    className="text-xs text-rose-700 border-rose-300 hover:bg-rose-50 flex items-center gap-1"
                  >
                    <MinusCircle className="h-3 w-3" />
                    Debit
                  </Button>
                </div>
              </div>

              {/* Administrative Security Controls */}
              <div className="border-t border-warm-200 pt-3 flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-warm-600">
                  Administrative Account Controls
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCustomerAction(selectedCustomer.id, "VERIFY_STUDENT")}
                    loading={actionInProgress}
                    className="text-xs flex items-center gap-1"
                  >
                    <GraduationCap className="h-3.5 w-3.5 text-indigo-600" />
                    Toggle Student Verification
                  </Button>

                  {selectedCustomer.account_status === "ACTIVE" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCustomerAction(selectedCustomer.id, "SUSPEND")}
                      loading={actionInProgress}
                      className="text-xs text-amber-800 border-amber-300 hover:bg-amber-50 flex items-center gap-1"
                    >
                      <Ban className="h-3.5 w-3.5 text-amber-600" />
                      Suspend Customer
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleCustomerAction(selectedCustomer.id, "ACTIVATE")}
                      loading={actionInProgress}
                      className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Reactivate Account
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
