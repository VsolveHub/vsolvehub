"use client";

import { useState } from "react";
import { 
  Wrench, Smartphone, Monitor, Eye, Save, Plus, 
  Trash2, Layers, CheckCircle2, ArrowRight, Shield, RefreshCw, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface FormField {
  id: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DROPDOWN" | "FILE_UPLOAD" | "TOGGLE";
  required: boolean;
}

export default function ServiceBuilderPage() {
  const [serviceName, setServiceName] = useState("Split AC Comprehensive Service");
  const [serviceSlug, setServiceSlug] = useState("split-ac-comprehensive-service");
  const [category, setCategory] = useState("Home Maintenance & Repairs");
  const [basePrice, setBasePrice] = useState(599);
  const [previewDevice, setPreviewDevice] = useState<"mobile_customer" | "mobile_partner" | "web">("mobile_customer");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [intakeFields, setIntakeFields] = useState<FormField[]>([
    { id: "f1", label: "How many AC units require servicing?", type: "NUMBER", required: true },
    { id: "f2", label: "AC Brand (Voltas, Daikin, LG, Bluestar)", type: "DROPDOWN", required: true },
    { id: "f3", label: "Is there water leakage from indoor unit?", type: "TOGGLE", required: false },
    { id: "f4", label: "Photo of indoor unit error code (optional)", type: "FILE_UPLOAD", required: false },
  ]);

  function addField() {
    const newId = `f_${Date.now()}`;
    setIntakeFields([...intakeFields, { id: newId, label: "New Booking Question", type: "TEXT", required: false }]);
  }

  function updateField(id: string, updates: Partial<FormField>) {
    setIntakeFields(intakeFields.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }

  function removeField(id: string) {
    setIntakeFields(intakeFields.filter((f) => f.id !== id));
  }

  async function handlePublishService() {
    setPublishing(true);
    setErrorMessage(null);
    try {
      const res = await adminFetch<{ status: string; slug: string }>("/api/v1/admin/categories/", {
        method: "POST",
        body: JSON.stringify({
          action: "CREATE_SERVICE",
          name: serviceName,
          category_id: null,
          archetype: "A1_TASK_VISIT",
          description: `Custom authored service with ${intakeFields.length} dynamic intake questions. Base rate ₹${basePrice}`,
          base_price: basePrice,
        }),
      });

      setPublished(true);
      setPublishedSlug(res.slug || serviceSlug);
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to persist service to database catalog");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §8 & §54 MARKETPLACE
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              No-Code Dynamic Service Builder & Live Preview
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Author services without code deployments. Configure dynamic intake questions and simulate live client rendering.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePublishService}
            disabled={publishing}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            {publishing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {publishing ? "Publishing to Database..." : "Publish Service Live"}
          </button>
        </div>
      </div>

      {published && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Service &apos;{serviceName}&apos; successfully published and committed to Django catalog ORM (`{publishedSlug}`).
          </span>
          <button onClick={() => setPublished(false)} className="text-emerald-700 text-xs underline font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600" />
          {errorMessage}
        </div>
      )}

      {/* Two-Column Layout: Left = Builder Controls, Right = Live Device Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Builder Controls */}
        <div className="lg:col-span-7 space-y-6">
          {/* Basic Details Card */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-[#0B192C] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#FF6500]" />
              1. Master Service Metadata
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Service Title</label>
                <input
                  type="text"
                  value={serviceName}
                  onChange={(e) => {
                    setServiceName(e.target.value);
                    setServiceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Catalog Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option>Home Maintenance & Repairs</option>
                  <option>Vehicle Rides & Transit</option>
                  <option>Construction & BOQ</option>
                  <option>Workforce Manpower</option>
                  <option>Hostels & PG Stays</option>
                  <option>Healthcare At Home</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Base Price (INR)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                  <input
                    type="number"
                    value={basePrice}
                    onChange={(e) => setBasePrice(Number(e.target.value))}
                    className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm font-mono font-bold text-[#0B192C]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Intake Question Builder */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#0B192C] flex items-center gap-2">
                <Wrench className="w-4 h-4 text-[#FF6500]" />
                2. Dynamic Customer Intake Questions
              </h2>
              <button
                type="button"
                onClick={addField}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF6500] hover:text-[#E35B00] bg-[#FF6500]/10 px-2.5 py-1.5 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Add Question
              </button>
            </div>

            <div className="space-y-3">
              {intakeFields.map((field, idx) => (
                <div key={field.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-white border text-gray-600 flex items-center justify-center text-xs font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => updateField(field.id, { label: e.target.value })}
                    className="grow px-2.5 py-1.5 text-xs border rounded-md bg-white font-medium text-gray-800"
                  />
                  <select
                    value={field.type}
                    onChange={(e) => updateField(field.id, { type: e.target.value as FormField["type"] })}
                    className="text-xs px-2 py-1.5 border rounded-md bg-white text-gray-700"
                  >
                    <option value="TEXT">Short Text</option>
                    <option value="NUMBER">Number Counter</option>
                    <option value="DROPDOWN">Dropdown List</option>
                    <option value="TOGGLE">Yes/No Toggle</option>
                    <option value="FILE_UPLOAD">Photo Upload</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(field.id, { required: e.target.checked })}
                      className="rounded text-[#FF6500]"
                    />
                    Req
                  </label>
                  <button
                    type="button"
                    onClick={() => removeField(field.id)}
                    className="text-gray-400 hover:text-red-600 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: §54 Live Preview Sandbox */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              §54 Live Simulator
            </span>
            <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
              <button
                type="button"
                onClick={() => setPreviewDevice("mobile_customer")}
                className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${
                  previewDevice === "mobile_customer" ? "bg-white text-[#0B192C] shadow-xs" : "text-gray-500"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" /> Customer App
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice("mobile_partner")}
                className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${
                  previewDevice === "mobile_partner" ? "bg-white text-[#0B192C] shadow-xs" : "text-gray-500"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-amber-600" /> Partner App
              </button>
              <button
                type="button"
                onClick={() => setPreviewDevice("web")}
                className={`p-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${
                  previewDevice === "web" ? "bg-white text-[#0B192C] shadow-xs" : "text-gray-500"
                }`}
              >
                <Monitor className="w-3.5 h-3.5" /> Web Desktop
              </button>
            </div>
          </div>

          {/* Device Mockup Shell */}
          <div className="flex justify-center">
            <div className="w-[360px] bg-slate-900 rounded-[38px] p-3 shadow-2xl border-4 border-slate-700">
              {/* Speaker / Notch */}
              <div className="h-4 w-32 bg-slate-800 rounded-full mx-auto mb-2" />

              {/* Screen Content */}
              <div className="bg-[#F8FAFC] rounded-[28px] overflow-hidden min-h-[520px] flex flex-col justify-between text-left">
                {/* App Bar */}
                <div className="bg-[#0B192C] text-white p-4">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                    {previewDevice === "mobile_partner" ? "V Solve Partner Portal" : "V Solve Hub Super App"}
                  </div>
                  <div className="font-bold text-sm mt-0.5">{serviceName}</div>
                </div>

                {/* Body Content */}
                <div className="p-4 space-y-4 grow overflow-y-auto">
                  <div className="bg-white p-3 rounded-xl shadow-xs border border-gray-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase font-semibold">Estimated Price</span>
                      <div className="text-xl font-bold text-[#0B192C]">₹{basePrice}</div>
                    </div>
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-md">
                      Free Inspection
                    </span>
                  </div>

                  {/* Render dynamic intake questions in simulated app */}
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                      {previewDevice === "mobile_partner" ? "Job Requirements Summary" : "Booking Details"}
                    </div>
                    {intakeFields.map((f) => (
                      <div key={f.id} className="bg-white p-2.5 rounded-lg border border-gray-100 text-xs space-y-1">
                        <label className="font-semibold text-gray-800 block">
                          {f.label} {f.required && <span className="text-red-500">*</span>}
                        </label>
                        {f.type === "NUMBER" && (
                          <div className="flex items-center gap-2">
                            <button className="w-6 h-6 rounded bg-gray-100 font-bold text-center">-</button>
                            <span className="font-bold text-sm">1</span>
                            <button className="w-6 h-6 rounded bg-gray-100 font-bold text-center">+</button>
                          </div>
                        )}
                        {f.type === "DROPDOWN" && (
                          <div className="p-1.5 bg-gray-50 rounded border text-gray-600 text-xs">
                            Select Option ▼
                          </div>
                        )}
                        {f.type === "TOGGLE" && (
                          <div className="flex gap-2">
                            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">Yes</span>
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-xs">No</span>
                          </div>
                        )}
                        {f.type === "FILE_UPLOAD" && (
                          <div className="p-2 border border-dashed rounded text-center text-[10px] text-gray-400">
                            Tap to attach photo
                          </div>
                        )}
                        {f.type === "TEXT" && (
                          <div className="p-1.5 bg-gray-50 rounded border text-gray-400 text-xs">
                            Type here...
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sticky Action Footer */}
                <div className="p-3 bg-white border-t border-gray-200">
                  <button className="w-full py-2.5 rounded-xl font-bold text-xs text-white bg-[#FF6500] hover:bg-[#E35B00] shadow-md flex items-center justify-center gap-1">
                    {previewDevice === "mobile_partner" ? "Accept Job Order (₹" + Math.round(basePrice * 0.85) + " payout)" : "Schedule Booking Now"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
