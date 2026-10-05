"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Card, Field, Input } from "@vsolve/ui";
import { Check, FileUp, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { fetchJobOptions, type JobOptions } from "../queries";
import {
  fetchMyJobProfile,
  saveMyJobProfile,
  uploadProfileResume,
  type JobProfile,
} from "../seeker-queries";

type Option = { value: string; label: string };

const AVAILABILITY: Option[] = [
  { value: "IMMEDIATE", label: "Immediately" },
  { value: "WEEK", label: "Within 7 days" },
  { value: "FORTNIGHT", label: "Within 15 days" },
  { value: "MONTH", label: "Within 30 days" },
];

const VISIBILITY: Option[] = [
  { value: "OPEN", label: "Matching employers can find me" },
  { value: "APPLIED_ONLY", label: "Only employers I apply to" },
];

function Pills({
  options,
  value,
  onChange,
  multi = false,
}: {
  options: readonly Option[];
  value: string | string[];
  onChange: (next: string | string[]) => void;
  multi?: boolean;
}) {
  const chosen = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = chosen.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (!multi) return onChange(on ? "" : o.value);
              const next = new Set(chosen);
              if (on) next.delete(o.value);
              else next.add(o.value);
              onChange([...next]);
            }}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition ${
              on ? "border-action bg-action text-action-text" : "border-line bg-surface text-text hover:border-line-strong"
            }`}
          >
            {on && multi ? <Check className="size-3.5" aria-hidden /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold text-navy-900">{title}</h2>
      {hint ? <p className="-mt-1 text-xs text-text-secondary">{hint}</p> : null}
      {children}
    </section>
  );
}

type Form = {
  full_name: string;
  roles: string[];
  skills: string[];
  experience_band: string;
  qualification: string;
  languages: string[];
  city: string;
  area: string;
  expected_salary_rupees: string;
  job_types: string[];
  available_from: string;
  visibility: string;
};

const EMPTY: Form = {
  full_name: "",
  roles: [],
  skills: [],
  experience_band: "",
  qualification: "",
  languages: ["TELUGU"],
  city: "",
  area: "",
  expected_salary_rupees: "",
  job_types: ["FULL_TIME"],
  available_from: "IMMEDIATE",
  visibility: "OPEN",
};

function fromProfile(p: JobProfile): Form {
  return {
    full_name: p.full_name ?? "",
    roles: (p.roles as string[]) ?? [],
    skills: (p.skills as string[]) ?? [],
    experience_band: p.experience_band ?? "",
    qualification: p.qualification ?? "",
    languages: (p.languages as string[]) ?? [],
    city: p.city ?? "",
    area: p.area ?? "",
    expected_salary_rupees: p.expected_salary_rupees ? String(p.expected_salary_rupees) : "",
    job_types: (p.job_types as string[]) ?? [],
    available_from: p.available_from ?? "",
    visibility: p.visibility ?? "OPEN",
  };
}

/**
 * The job seeker's profile, filled once mostly by tapping. Jobs are matched against it, and
 * applying sends it in one tap.
 */
export function JobProfileForm({ defaultName = "", returnTo }: { defaultName?: string; returnTo?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["job-options"], queryFn: fetchJobOptions, staleTime: 3600_000 });
  const profile = useQuery({ queryKey: ["my-job-profile"], queryFn: fetchMyJobProfile });
  const [form, setForm] = useState<Form>({ ...EMPTY, full_name: defaultName });
  const [roleSearch, setRoleSearch] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [customSkill, setCustomSkill] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile.data) setForm(fromProfile(profile.data));
  }, [profile.data]);

  const opts = options.data as JobOptions | undefined;
  const allRoles = useMemo(
    () => (opts?.categories ?? []).flatMap((cat) => cat.roles.map((role) => ({ ...role, category: cat.name }))),
    [opts],
  );
  const roleHits = roleSearch.trim()
    ? allRoles.filter((r) => `${r.name} ${r.category}`.toLowerCase().includes(roleSearch.trim().toLowerCase())).slice(0, 12)
    : [];
  // Skills suggested by the jobs they picked.
  const skillIdeas = useMemo(() => {
    const ideas = allRoles.filter((r) => form.roles.includes(r.name)).flatMap((r) => r.skills);
    return [...new Set([...ideas, ...form.skills])];
  }, [allRoles, form.roles, form.skills]);

  const set = (patch: Partial<Form>) => {
    setSaved(false);
    setError(null);
    setForm((f) => ({ ...f, ...patch }));
  };
  const toggleRole = (name: string) => {
    if (form.roles.includes(name)) return set({ roles: form.roles.filter((r) => r !== name) });
    if (form.roles.length >= 3) return setError("Pick up to 3 jobs.");
    set({ roles: [...form.roles, name] });
  };

  const save = useMutation({
    mutationFn: () =>
      saveMyJobProfile({
        ...form,
        expected_salary_rupees: Number(form.expected_salary_rupees.replace(/[,\s₹]/g, "")) || 0,
      }),
    onSuccess: (data) => {
      qc.setQueryData(["my-job-profile"], data);
      void qc.invalidateQueries({ queryKey: ["jobs-for-you"] });
      setSaved(true);
      if (returnTo) router.push(returnTo);
    },
    onError: (err) => setError(friendlyErrorMessage(err)),
  });
  const resume = useMutation({
    mutationFn: uploadProfileResume,
    onSuccess: (data) => qc.setQueryData(["my-job-profile"], data),
    onError: (err) => setError(friendlyErrorMessage(err)),
  });

  if (!opts) return <p className="p-6 text-sm text-text-secondary">Loading…</p>;

  return (
    <div className="flex flex-col gap-5 pb-28">
      <Card className="flex flex-col gap-6 p-4 sm:p-6">
        <Field label="Your name">
          <Input value={form.full_name} maxLength={120} onChange={(e) => set({ full_name: e.target.value })} />
        </Field>

        <Block title="Jobs you want" hint="Pick up to 3.">
          {form.roles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {form.roles.map((r) => (
                <button key={r} type="button" onClick={() => toggleRole(r)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-action bg-action px-4 text-sm font-semibold text-action-text">
                  <Check className="size-3.5" aria-hidden /> {r}
                </button>
              ))}
            </div>
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input className="pl-9" placeholder="Search, e.g. sales, driver, nurse" value={roleSearch} onChange={(e) => setRoleSearch(e.target.value)} />
          </div>
          {roleHits.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {roleHits.map((r) => (
                <button key={r.id} type="button" onClick={() => { toggleRole(r.name); setRoleSearch(""); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-text hover:border-action">
                  <Plus className="size-3.5" aria-hidden /> {r.name}
                  <span className="font-normal text-text-secondary">· {r.category}</span>
                </button>
              ))}
            </div>
          ) : null}
          {!roleSearch ? (
            <div className="flex flex-wrap gap-2">
              {opts.categories.slice(0, 6).flatMap((cat) => cat.roles.slice(0, 1)).filter((r) => !form.roles.includes(r.name)).map((r) => (
                <button key={r.id} type="button" onClick={() => toggleRole(r.name)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-text-secondary hover:border-action">
                  <Plus className="size-3.5" aria-hidden /> {r.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Input placeholder="Not listed? Type a job" maxLength={60} value={customRole} onChange={(e) => setCustomRole(e.target.value)} />
            <Button type="button" variant="secondary" disabled={!customRole.trim()} onClick={() => { toggleRole(customRole.trim()); setCustomRole(""); }}>
              Add
            </Button>
          </div>
        </Block>

        <Block title="Your skills" hint={form.roles.length ? "Tap the ones you have." : "Pick a job above to see suggestions."}>
          <div className="flex flex-wrap gap-2">
            {skillIdeas.map((s) => {
              const on = form.skills.includes(s);
              return (
                <button key={s} type="button" aria-pressed={on} onClick={() => set({ skills: on ? form.skills.filter((x) => x !== s) : [...form.skills, s] })} className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold ${on ? "border-action bg-action-surface text-action" : "border-line bg-surface text-text-secondary"}`}>
                  {on ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />} {s}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Add a skill" maxLength={60} value={customSkill} onChange={(e) => setCustomSkill(e.target.value)} />
            <Button type="button" variant="secondary" disabled={!customSkill.trim()} onClick={() => { const v = customSkill.trim(); if (!form.skills.includes(v)) set({ skills: [...form.skills, v] }); setCustomSkill(""); }}>
              Add
            </Button>
          </div>
        </Block>

        <Block title="Experience">
          <Pills options={opts.experience_bands.filter((o) => o.value !== "ANY")} value={form.experience_band} onChange={(v) => set({ experience_band: v as string })} />
        </Block>
        <Block title="Education">
          <Pills options={opts.qualifications} value={form.qualification} onChange={(v) => set({ qualification: v as string })} />
        </Block>
        <Block title="Languages you speak">
          <Pills multi options={opts.languages} value={form.languages} onChange={(v) => set({ languages: v as string[] })} />
        </Block>
        <Block title="Where do you live?">
          <Pills options={opts.cities.map((c) => ({ value: c, label: c }))} value={form.city} onChange={(v) => set({ city: v as string })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Other city" showOptional={false}>
              <Input value={opts.cities.includes(form.city) ? "" : form.city} onChange={(e) => set({ city: e.target.value })} />
            </Field>
            <Field label="Area">
              <Input placeholder="e.g. Kukatpally" value={form.area} onChange={(e) => set({ area: e.target.value })} />
            </Field>
          </div>
        </Block>
        <Block title="Expected monthly salary (₹)">
          <div className="flex flex-wrap gap-2">
            {[12000, 15000, 20000, 25000, 30000, 40000].map((n) => (
              <button key={n} type="button" aria-pressed={Number(form.expected_salary_rupees) === n} onClick={() => set({ expected_salary_rupees: String(n) })} className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${Number(form.expected_salary_rupees) === n ? "border-action bg-action text-action-text" : "border-line bg-surface text-text"}`}>
                ₹{n.toLocaleString("en-IN")}
              </button>
            ))}
          </div>
          <Input inputMode="numeric" aria-label="Expected monthly salary" placeholder="Or type an amount" value={form.expected_salary_rupees} onChange={(e) => set({ expected_salary_rupees: e.target.value })} />
        </Block>
        <Block title="Job type">
          <Pills multi options={opts.job_types} value={form.job_types} onChange={(v) => set({ job_types: v as string[] })} />
        </Block>
        <Block title="When can you join?">
          <Pills options={AVAILABILITY} value={form.available_from} onChange={(v) => set({ available_from: v as string })} />
        </Block>
        <Block title="Resume (optional)" hint="PDF or Word, up to 5 MB. Sent when you apply.">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-control border border-dashed border-line-strong px-4 text-sm font-semibold text-text">
            <FileUp className="size-4" aria-hidden />
            {resume.isPending ? "Uploading…" : profile.data?.has_resume ? `Replace ${profile.data.resume_name}` : "Upload resume"}
            <input type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) resume.mutate(f); e.target.value = ""; }} />
          </label>
        </Block>
        <Block title="Who can see your profile?" hint="Your phone number is only shared when you apply.">
          <Pills options={VISIBILITY} value={form.visibility} onChange={(v) => set({ visibility: (v as string) || "OPEN" })} />
        </Block>
      </Card>

      {error ? <p role="alert" className="rounded-control border border-danger-line bg-danger-surface p-3 text-sm text-danger-text">{error}</p> : null}
      {saved && !returnTo ? <p role="status" className="rounded-control border border-success-line bg-success-surface p-3 text-sm text-success-text">Profile saved. Matching jobs are on the jobs page.</p> : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <Button
            className="w-full"
            loading={save.isPending}
            loadingLabel="Saving…"
            onClick={() => {
              if (!form.full_name.trim()) return setError("Add your name.");
              if (form.roles.length === 0) return setError("Pick at least one job you want.");
              if (!form.city.trim()) return setError("Choose where you live.");
              save.mutate();
            }}
          >
            Save profile
          </Button>
        </div>
      </div>
    </div>
  );
}
