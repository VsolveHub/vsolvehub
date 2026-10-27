"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, Field, Input, QuantityStepper, Textarea, useT, useToast } from "@vsolve/ui";
import { ArrowLeft, Check, ChevronDown, MapPin, Plus, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  fetchJobOptions,
  hhmm,
  optionLabel,
  postJob,
  publishJob,
  rupeesLabel,
  updateJob,
  type JobCreate,
  type JobOptions,
  type JobRoleTemplate,
} from "../jobs-queries";
import { fetchPartnerListing, type PartnerListing } from "../queries";

type Draft = {
  id: string | null;
  status: string;
  templateId: string | null;
  category: string;
  title: string;
  vacancies: number;
  jobType: string;
  experience: string;
  salaryMin: string;
  salaryMax: string;
  period: string;
  urgency: string;
  required: string[];
  preferred: string[];
  skillIdeas: string[];
  languages: string[];
  qualification: string;
  benefits: string[];
  duties: string[];
  dutyIdeas: string[];
  shift: string;
  workMode: string;
  timingStart: string;
  timingEnd: string;
  weeklyOff: string;
  city: string;
  area: string;
  description: string;
  ownDescription: boolean;
};

const EMPTY: Draft = {
  id: null,
  status: "",
  templateId: null,
  category: "",
  title: "",
  vacancies: 1,
  jobType: "FULL_TIME",
  experience: "",
  salaryMin: "",
  salaryMax: "",
  period: "MONTHLY",
  urgency: "NORMAL",
  required: [],
  preferred: [],
  skillIdeas: [],
  languages: [],
  qualification: "",
  benefits: [],
  duties: [],
  dutyIdeas: [],
  shift: "",
  workMode: "",
  timingStart: "",
  timingEnd: "",
  weeklyOff: "",
  city: "",
  area: "",
  description: "",
  ownDescription: false,
};

const STEPS = ["Job", "Basics", "Skills", "Location & preview"] as const;

function fromTemplate(draft: Draft, category: string, role: JobRoleTemplate): Draft {
  return {
    ...draft,
    templateId: role.id,
    category,
    title: role.name,
    jobType: role.job_type || draft.jobType,
    shift: role.shift || draft.shift,
    workMode: role.work_mode || draft.workMode,
    salaryMin: role.salary_min_rupees ? String(role.salary_min_rupees) : draft.salaryMin,
    salaryMax: role.salary_max_rupees ? String(role.salary_max_rupees) : draft.salaryMax,
    // The first three suggested skills start as must-haves; the rest wait as ideas.
    required: role.skills.slice(0, 3),
    preferred: [],
    skillIdeas: role.skills,
    duties: [...role.responsibilities],
    dutyIdeas: role.responsibilities,
  };
}

function fromListing(job: PartnerListing): Draft {
  const rupees = (paise?: number) => (paise ? String(Math.round(paise / 100)) : "");
  const required = (job.required_skills as string[] | undefined) ?? [];
  const preferred = (job.preferred_skills as string[] | undefined) ?? [];
  const duties = (job.responsibilities as string[] | undefined) ?? [];
  return {
    ...EMPTY,
    id: job.id,
    status: job.status,
    templateId: (job.role_template as string | null | undefined) ?? null,
    category: job.job_category ?? "",
    title: job.title,
    vacancies: job.vacancies ?? 1,
    jobType: job.job_type || "FULL_TIME",
    experience: job.experience_band ?? "",
    salaryMin: rupees(job.salary_min_paise),
    salaryMax: rupees(job.salary_max_paise),
    period: job.salary_period || "MONTHLY",
    urgency: job.urgency || "NORMAL",
    required,
    preferred,
    skillIdeas: [...required, ...preferred],
    languages: (job.languages as string[] | undefined) ?? [],
    qualification: job.min_qualification ?? "",
    benefits: (job.benefits as string[] | undefined) ?? [],
    duties,
    dutyIdeas: duties,
    shift: job.shift ?? "",
    workMode: job.work_mode ?? "",
    timingStart: hhmm(job.timing_start),
    timingEnd: hhmm(job.timing_end),
    weeklyOff: job.weekly_off ?? "",
    city: job.city ?? "",
    area: job.area ?? "",
    description: job.description ?? "",
    ownDescription: true,
  };
}

function toBody(draft: Draft): JobCreate {
  const paise = (rupees: string) => {
    const n = Number(rupees.replace(/[,\s₹]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  };
  return {
    role_template_id: draft.templateId,
    title: draft.title.trim(),
    job_category: draft.category,
    vacancies: draft.vacancies,
    job_type: draft.jobType,
    experience_band: draft.experience,
    required_skills: draft.required,
    preferred_skills: draft.preferred,
    responsibilities: draft.duties,
    benefits: draft.benefits,
    languages: draft.languages,
    min_qualification: draft.qualification,
    shift: draft.shift,
    work_mode: draft.workMode,
    timing_start: draft.timingStart || null,
    timing_end: draft.timingEnd || null,
    weekly_off: draft.weeklyOff,
    urgency: draft.urgency,
    city: draft.city.trim(),
    area: draft.area.trim(),
    salary_min_paise: paise(draft.salaryMin),
    salary_max_paise: paise(draft.salaryMax),
    salary_period: draft.period,
    description: draft.ownDescription ? draft.description : "",
    publish: false,
  };
}

/** A row of tap-to-pick pills. Single choice unless `multi`. */
function Chips({
  label,
  options,
  value,
  onChange,
  multi = false,
}: {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string | string[];
  onChange: (next: string | string[]) => void;
  multi?: boolean;
}) {
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold text-navy-900">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.has(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (multi) {
                  const next = new Set(selected);
                  if (on) next.delete(option.value);
                  else next.add(option.value);
                  onChange([...next]);
                } else onChange(on ? "" : option.value);
              }}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition ${
                on
                  ? "border-action bg-action text-action-text"
                  : "border-line bg-surface text-text hover:border-line-strong"
              }`}
            >
              {on && multi ? <Check className="size-3.5" aria-hidden /> : null}
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Chips from suggestions plus a "+ Add" box for anything not listed. */
function TagPicker({
  label,
  hint,
  ideas,
  value,
  onChange,
  addLabel,
  exclude = [],
}: {
  label: string;
  hint?: string;
  ideas: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
  exclude?: readonly string[];
}) {
  const t = useT();
  const [text, setText] = useState("");
  const shown = [...new Set([...ideas, ...value])].filter((idea) => !exclude.includes(idea));
  function add() {
    const item = text.trim().replace(/\s+/g, " ");
    if (!item) return;
    if (!value.some((v) => v.toLowerCase() === item.toLowerCase())) onChange([...value, item]);
    setText("");
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-navy-900">{label}</p>
      {hint ? <p className="-mt-1 text-xs text-text-secondary">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">
        {shown.map((idea) => {
          const on = value.includes(idea);
          return (
            <button
              key={idea}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== idea) : [...value, idea])}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition ${
                on
                  ? "border-action bg-action-surface text-action"
                  : "border-line bg-surface text-text-secondary hover:border-line-strong"
              }`}
            >
              {on ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
              {idea}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input
          aria-label={addLabel}
          placeholder={addLabel}
          value={text}
          maxLength={60}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add} disabled={!text.trim()}>
          {t("listings.wizard.add")}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-6">
      <h2 className="text-lg font-bold text-navy-900">{title}</h2>
      {children}
    </Card>
  );
}

/**
 * Post a job in four short steps, mostly by tapping:
 * 1. Job: category, then a common role (or type your own). Skills, duties and pay fill in.
 * 2. Basics: people needed, job type, experience, salary.
 * 3. Skills: must have / good to have. Extras sit under "More options".
 * 4. Location, then a preview with the description written for you. Publish goes live at once.
 */
export function PostJobWizard({ editId }: { editId?: string | null }) {
  const t = useT();
  const STEP_LABELS: Record<(typeof STEPS)[number], string> = {
    Job: t("listings.wizard.step.job"),
    Basics: t("listings.wizard.step.basics"),
    Skills: t("listings.wizard.step.skills"),
    "Location & preview": t("listings.wizard.step.locationPreview"),
  };
  const router = useRouter();
  const qc = useQueryClient();
  const { notify } = useToast();
  const options = useQuery({ queryKey: ["job-options"], queryFn: fetchJobOptions });
  const existing = useQuery({
    queryKey: ["partner-listing", editId],
    queryFn: () => fetchPartnerListing(editId!),
    enabled: Boolean(editId),
  });

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [preview, setPreview] = useState<PartnerListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing.data) {
      setDraft(fromListing(existing.data as PartnerListing));
      setStep(1);
    }
  }, [existing.data]);

  const set = (patch: Partial<Draft>) => {
    setError(null);
    setPreview(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const opts = options.data as JobOptions | undefined;
  const roles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = (opts?.categories ?? []).flatMap((cat) =>
      cat.roles.map((role) => ({ category: cat.name, role })),
    );
    if (q) return all.filter(({ role, category }) => `${role.name} ${category}`.toLowerCase().includes(q));
    return all.filter(({ category }) => category === draft.category);
  }, [opts, search, draft.category]);

  const save = useMutation({
    // Takes the draft explicitly so a just-edited description is never sent stale.
    mutationFn: async (current: Draft) => {
      const body = toBody(current);
      if (current.id) {
        const patch: Record<string, unknown> = { ...body };
        delete patch.publish;
        return updateJob(current.id, {
          ...(patch as Omit<JobCreate, "publish">),
          regenerate_description: !current.ownDescription,
        });
      }
      return postJob(body);
    },
    onSuccess: (job) => {
      setDraft((current) => ({
        ...current,
        id: job.id,
        status: job.status,
        description: job.description ?? "",
      }));
      setPreview(job);
      void qc.invalidateQueries({ queryKey: ["partner-listings"] });
    },
    onError: (err) => setError(friendlyErrorMessage(err)),
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!draft.id) throw new Error(t("listings.wizard.errorSaveFirst"));
      if (draft.status === "PUBLISHED") return preview!;
      return publishJob(draft.id);
    },
    onSuccess: () => {
      notify(draft.status === "PUBLISHED" ? t("listings.wizard.jobUpdated") : t("listings.wizard.jobLive"));
      void qc.invalidateQueries({ queryKey: ["partner-listings"] });
      void qc.invalidateQueries({ queryKey: ["partner-listing-home"] });
      router.push("/listings");
    },
    onError: (err) => setError(friendlyErrorMessage(err)),
  });

  function next() {
    setError(null);
    if (step === 0 && !draft.title.trim()) return setError(t("listings.wizard.errorPickJob"));
    if (step === 1) {
      if (!draft.jobType) return setError(t("listings.wizard.errorJobType"));
      if (!(Number(draft.salaryMin) > 0)) return setError(t("listings.wizard.errorSalary"));
      if (draft.salaryMax && Number(draft.salaryMax) < Number(draft.salaryMin))
        return setError(t("listings.wizard.errorMaxSalary"));
    }
    if (step === 2 && draft.required.length === 0) return setError(t("listings.wizard.errorSkill"));
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (options.isLoading || (editId && existing.isLoading)) {
    return <p className="p-6 text-sm text-text-secondary">{t("listings.wizard.loading")}</p>;
  }
  if (options.error || !opts) {
    return <p className="p-6 text-sm text-danger-text">{friendlyErrorMessage(options.error)}</p>;
  }

  const bandOn = (low: number, high: number) =>
    Number(draft.salaryMin) === low && (high ? Number(draft.salaryMax) === high : !draft.salaryMax);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 pb-32">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (step === 0 || (editId && step === 1) ? router.push("/listings") : setStep(step - 1))}
          className="inline-flex size-11 min-h-11 min-w-11 items-center justify-center rounded-full border border-line bg-surface transition-colors hover:bg-surface-hover"
          aria-label={t("listings.wizard.back")}
        >
          <ArrowLeft className="size-4" />
        </button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">
            {t("listings.wizard.stepOf", { step: step + 1, total: STEPS.length, name: STEP_LABELS[STEPS[step]!] })}
          </p>
          <h1 className="text-xl font-extrabold text-navy-900">
            {editId ? t("listings.wizard.editJob") : t("listings.wizard.postJob")}
            {draft.title && step > 0 ? ` · ${draft.title}` : ""}
          </h1>
        </div>
      </div>
      <ol className="grid grid-cols-4 gap-1.5" aria-hidden>
        {STEPS.map((name, i) => (
          <li key={name} className={`h-1.5 rounded-full ${i <= step ? "bg-action" : "bg-line"}`} />
        ))}
      </ol>

      {step === 0 ? (
        <Section title={t("listings.wizard.jobCategoryTitle")}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              className="pl-9"
              placeholder={t("listings.wizard.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {!search ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {opts.categories.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  aria-pressed={draft.category === cat.name}
                  onClick={() => set({ category: cat.name })}
                  className={`min-h-14 rounded-card border p-3 text-left text-sm font-bold transition ${
                    draft.category === cat.name
                      ? "border-action bg-action-surface text-action"
                      : "border-line bg-surface text-navy-900 hover:border-line-strong"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          ) : null}
          {roles.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-navy-900">
                {search ? t("listings.wizard.matchingJobs") : t("listings.wizard.commonJobs")}
              </p>
              <div className="flex flex-wrap gap-2">
                {roles.map(({ category, role }) => (
                  <button
                    key={role.id}
                    type="button"
                    aria-pressed={draft.templateId === role.id}
                    onClick={() => {
                      setDraft((d) => fromTemplate(d, category, role));
                      setStep(1);
                    }}
                    className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${
                      draft.templateId === role.id
                        ? "border-action bg-action text-action-text"
                        : "border-line bg-surface text-text hover:border-action"
                    }`}
                  >
                    {role.name}
                    {search ? <span className="ml-1 font-normal opacity-70">· {category}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <Field label={t("listings.wizard.notListed")} showOptional={false}>
            <Input
              placeholder={t("listings.wizard.jobTitlePlaceholder")}
              maxLength={120}
              value={draft.templateId ? "" : draft.title}
              onChange={(event) => set({ title: event.target.value, templateId: null })}
            />
          </Field>
        </Section>
      ) : null}

      {step === 1 ? (
        <Section title={t("listings.wizard.basicsTitle")}>
          <Field label={t("listings.wizard.jobTitle")}>
            <Input value={draft.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <QuantityStepper
            label={t("listings.wizard.howManyPeople")}
            value={draft.vacancies}
            min={1}
            max={500}
            onChange={(vacancies) => set({ vacancies })}
            decrementLabel={t("listings.wizard.onePersonFewer")}
            incrementLabel={t("listings.wizard.oneMorePerson")}
            unit={t("listings.wizard.peopleUnit")}
          />
          <Chips label={t("listings.wizard.jobType")} options={opts.job_types} value={draft.jobType} onChange={(v) => set({ jobType: v as string })} />
          <Chips
            label={t("listings.wizard.experienceNeeded")}
            options={opts.experience_bands}
            value={draft.experience}
            onChange={(v) => set({ experience: v as string })}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-navy-900">{t("listings.wizard.monthlySalary")}</legend>
            <div className="flex flex-wrap gap-2">
              {opts.salary_bands.map((band) => (
                <button
                  key={`${band.min_rupees}-${band.max_rupees}`}
                  type="button"
                  aria-pressed={bandOn(band.min_rupees, band.max_rupees)}
                  onClick={() =>
                    set({
                      period: "MONTHLY",
                      salaryMin: String(band.min_rupees),
                      salaryMax: band.max_rupees ? String(band.max_rupees) : "",
                    })
                  }
                  className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${
                    bandOn(band.min_rupees, band.max_rupees)
                      ? "border-action bg-action text-action-text"
                      : "border-line bg-surface text-text hover:border-line-strong"
                  }`}
                >
                  {band.max_rupees
                    ? `${rupeesLabel(band.min_rupees)} – ${rupeesLabel(band.max_rupees)}`
                    : `${rupeesLabel(band.min_rupees)}+`}
                </button>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <Field label={t("listings.wizard.minimumRupees")} showOptional={false}>
                <Input inputMode="numeric" value={draft.salaryMin} onChange={(e) => set({ salaryMin: e.target.value })} />
              </Field>
              <Field label={t("listings.wizard.maximumRupees")} showOptional={false}>
                <Input inputMode="numeric" value={draft.salaryMax} onChange={(e) => set({ salaryMax: e.target.value })} />
              </Field>
            </div>
          </fieldset>
          <Chips label={t("listings.wizard.paid")} options={opts.salary_periods} value={draft.period} onChange={(v) => set({ period: (v as string) || "MONTHLY" })} />
          <Chips label={t("listings.wizard.howSoon")} options={opts.urgencies} value={draft.urgency} onChange={(v) => set({ urgency: (v as string) || "NORMAL" })} />
        </Section>
      ) : null}

      {step === 2 ? (
        <Section title={t("listings.wizard.skillsTitle")}>
          <TagPicker
            label={t("listings.wizard.mustHave")}
            hint={t("listings.wizard.mustHaveHint")}
            ideas={draft.skillIdeas}
            value={draft.required}
            exclude={draft.preferred}
            onChange={(required) => set({ required })}
            addLabel={t("listings.wizard.addSkill")}
          />
          <TagPicker
            label={t("listings.wizard.goodToHave")}
            ideas={draft.skillIdeas}
            value={draft.preferred}
            exclude={draft.required}
            onChange={(preferred) => set({ preferred })}
            addLabel={t("listings.wizard.addSkill")}
          />
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-text-link"
          >
            <ChevronDown className={`size-4 transition ${moreOpen ? "rotate-180" : ""}`} />
            {t("listings.wizard.moreOptions")}
          </button>
          {moreOpen ? (
            <div className="flex flex-col gap-5 border-t border-line pt-5">
              <Chips label={t("listings.wizard.shift")} options={opts.shifts} value={draft.shift} onChange={(v) => set({ shift: v as string })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("listings.wizard.startsAt")} showOptional={false}>
                  <Input type="time" value={draft.timingStart} onChange={(e) => set({ timingStart: e.target.value })} />
                </Field>
                <Field label={t("listings.wizard.endsAt")} showOptional={false}>
                  <Input type="time" value={draft.timingEnd} onChange={(e) => set({ timingEnd: e.target.value })} />
                </Field>
              </div>
              <Chips label={t("listings.wizard.weeklyOff")} options={opts.weekly_offs} value={draft.weeklyOff} onChange={(v) => set({ weeklyOff: v as string })} />
              <Chips label={t("listings.wizard.workPlace")} options={opts.work_modes} value={draft.workMode} onChange={(v) => set({ workMode: v as string })} />
              <TagPicker
                label={t("listings.wizard.benefits")}
                ideas={opts.benefits}
                value={draft.benefits}
                onChange={(benefits) => set({ benefits })}
                addLabel={t("listings.wizard.addBenefit")}
              />
              <Chips multi label={t("listings.wizard.languagesSpoken")} options={opts.languages} value={draft.languages} onChange={(v) => set({ languages: v as string[] })} />
              <Chips
                label={t("listings.wizard.minQualification")}
                options={opts.qualifications}
                value={draft.qualification}
                onChange={(v) => set({ qualification: v as string })}
              />
              <TagPicker
                label={t("listings.wizard.duties")}
                ideas={draft.dutyIdeas}
                value={draft.duties}
                onChange={(duties) => set({ duties })}
                addLabel={t("listings.wizard.addDuty")}
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      {step === 3 ? (
        <>
          <Section title={t("listings.wizard.locationTitle")}>
            <Chips
              label={t("listings.wizard.city")}
              options={opts.cities.map((city) => ({ value: city, label: city }))}
              value={draft.city}
              onChange={(v) => set({ city: v as string })}
            />
            <Field label={t("listings.wizard.otherCity")} showOptional={false}>
              <Input
                placeholder={t("listings.wizard.typeIfNotListed")}
                value={opts.cities.includes(draft.city) ? "" : draft.city}
                onChange={(e) => set({ city: e.target.value })}
              />
            </Field>
            <Field label={t("listings.wizard.areaLocality")}>
              <Input placeholder={t("listings.wizard.areaPlaceholder")} maxLength={120} value={draft.area} onChange={(e) => set({ area: e.target.value })} />
            </Field>
            {!preview ? (
              <Button
                loading={save.isPending}
                loadingLabel={t("listings.wizard.preparingPreview")}
                disabled={!draft.city.trim()}
                onClick={() => save.mutate(draft)}
              >
                <Sparkles className="size-4" aria-hidden />
                {t("listings.wizard.seePreview")}
              </Button>
            ) : null}
          </Section>

          {preview ? (
            <Card className="flex flex-col gap-4 border-action p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-extrabold text-navy-900">{preview.title}</h2>
                  <p className="text-sm text-text-secondary">{preview.poster_name}</p>
                </div>
                {draft.urgency !== "NORMAL" ? <Badge tone="warning">{optionLabel(opts.urgencies, draft.urgency)}</Badge> : null}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text">
                <li className="inline-flex items-center gap-1">
                  <MapPin className="size-4 text-text-muted" aria-hidden />
                  {preview.location_text}
                </li>
                <li>
                  💰 {rupeesLabel(Number(draft.salaryMin))}
                  {draft.salaryMax ? ` – ${rupeesLabel(Number(draft.salaryMax))}` : "+"}{" "}
                  {optionLabel(opts.salary_periods, draft.period)}
                </li>
                <li>{t("listings.wizard.vacanciesNeeded", { count: draft.vacancies })}</li>
                <li>{optionLabel(opts.job_types, draft.jobType)}</li>
                {draft.experience ? <li>{optionLabel(opts.experience_bands, draft.experience)}</li> : null}
              </ul>
              <div className="flex flex-wrap gap-1.5">
                {draft.required.map((skill) => (
                  <Badge key={skill} tone="info">{skill}</Badge>
                ))}
                {draft.preferred.map((skill) => (
                  <Badge key={skill}>{skill}</Badge>
                ))}
              </div>
              {editingText ? (
                <div className="flex flex-col gap-2">
                  <Textarea rows={6} maxLength={5000} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      loading={save.isPending}
                      onClick={() => {
                        const next = { ...draft, ownDescription: true };
                        setDraft(next);
                        setEditingText(false);
                        save.mutate(next);
                      }}
                    >
                      {t("listings.wizard.saveText")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingText(false)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-control bg-surface-sunken p-3">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-text">{draft.description}</p>
                  <button type="button" onClick={() => setEditingText(true)} className="mt-2 text-xs font-bold text-text-link">
                    {t("listings.wizard.editDescription")}
                  </button>
                </div>
              )}
              <p className="text-xs text-text-secondary">
                {t("listings.wizard.matchNote")}
              </p>
            </Card>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-control border border-danger-line bg-danger-surface p-3 text-sm text-danger-text">
          {error}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-2">
          {step < 3 ? (
            <Button className="flex-1" onClick={next}>
              {t("listings.wizard.next")}
            </Button>
          ) : preview ? (
            <>
              <Button variant="secondary" onClick={() => router.push("/listings")} disabled={publish.isPending}>
                {draft.status === "PUBLISHED" ? t("listings.wizard.close") : t("listings.wizard.saveDraft")}
              </Button>
              <Button className="flex-1" loading={publish.isPending} loadingLabel={t("listings.wizard.publishing")} onClick={() => publish.mutate()}>
                {draft.status === "PUBLISHED" ? t("listings.wizard.done") : t("listings.wizard.publishJob")}
              </Button>
            </>
          ) : (
            <Button className="flex-1" disabled={!draft.city.trim()} loading={save.isPending} onClick={() => save.mutate(draft)}>
              {t("listings.wizard.seePreview")}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
