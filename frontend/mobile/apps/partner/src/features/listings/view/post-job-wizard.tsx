import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Badge,
  Button,
  Card,
  ChoiceChips,
  MultiChoiceChips,
  QuantityStepper,
  Text,
  TouchTimePicker,
} from "@vsolve/mobile-ui";
import {
  ArrowLeft,
  Briefcase,
  Check,
  ChevronDown,
  Clock,
  DollarSign,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react-native";

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
import {
  fetchPartnerListing,
  fetchSubscriptionPlans,
  purchaseSubscription,
} from "../queries";
import type { PartnerListing } from "../model";
import { SubscriptionDialog } from "./subscription-dialog";

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

/** Chip-based tag picker with text input */
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
  const [text, setText] = useState("");
  const shown = [...new Set([...ideas, ...value])].filter((idea) => !exclude.includes(idea));

  function add() {
    const item = text.trim().replace(/\s+/g, " ");
    if (!item) return;
    if (!value.some((v) => v.toLowerCase() === item.toLowerCase())) {
      onChange([...value, item]);
    }
    setText("");
  }

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-navy-900">{label}</Text>
      {hint ? <Text className="-mt-1 text-xs text-text-muted">{hint}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {shown.map((idea) => {
          const on = value.includes(idea);
          return (
            <Pressable
              key={idea}
              onPress={() => onChange(on ? value.filter((v) => v !== idea) : [...value, idea])}
              className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 ${
                on
                  ? "border-navy-900 bg-navy-900"
                  : "border-line bg-surface"
              }`}
            >
              {on ? <Check size={14} color="#ffffff" /> : <Plus size={14} color="#64748b" />}
              <Text className={`text-xs font-semibold ${on ? "text-white" : "text-text"}`}>
                {idea}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row items-center gap-2">
        <TextInput
          placeholder={addLabel}
          placeholderTextColor="#94a3b8"
          value={text}
          maxLength={60}
          onChangeText={setText}
          onSubmitEditing={add}
          returnKeyType="done"
          className="flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-text"
        />
        <Button
          variant="secondary"
          size="sm"
          onPress={add}
          disabled={!text.trim()}
          className="px-4"
        >
          Add
        </Button>
      </View>
    </View>
  );
}

function TimePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View className="flex-1 gap-1.5">
      <Text className="text-xs font-semibold text-text-muted">{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5"
      >
        <Text className="text-sm text-text">{value || "Pick time"}</Text>
        <Clock size={16} color="#64748b" />
      </Pressable>
      <TouchTimePicker
        open={open}
        onOpenChange={setOpen}
        value={value}
        onChange={onChange}
        title={`Select ${label}`}
      />
    </View>
  );
}

export function PostJobWizard({ editId }: { editId?: string | null }) {
  const router = useRouter();
  const qc = useQueryClient();

  const options = useQuery({ queryKey: ["job-options"], queryFn: fetchJobOptions });
  const existing = useQuery({
    queryKey: ["partner-listing", editId],
    queryFn: () => fetchPartnerListing(editId!),
    enabled: Boolean(editId),
  });

  const plansQuery = useQuery({
    queryKey: ["vendor-subscription-plans"],
    queryFn: fetchSubscriptionPlans,
  });

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [preview, setPreview] = useState<PartnerListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSubscription, setShowSubscription] = useState(false);

  const [prevExisting, setPrevExisting] = useState<unknown>(null);
  if (existing.data && existing.data !== prevExisting) {
    setPrevExisting(existing.data);
    setDraft(fromListing(existing.data as PartnerListing));
    setStep(1);
  }

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
    onError: (err: any) => {
      const msg = err?.message || "Failed to save job draft.";
      setError(msg);
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!draft.id) throw new Error("Save the job first.");
      if (draft.status === "PUBLISHED") return preview!;
      return publishJob(draft.id);
    },
    onSuccess: () => {
      Alert.alert(
        draft.status === "PUBLISHED" ? "Job Updated" : "Job Published",
        draft.status === "PUBLISHED"
          ? "Your job posting has been updated."
          : "Your job is now live and candidates can apply.",
        [
          {
            text: "View Openings",
            onPress: () => {
              void qc.invalidateQueries({ queryKey: ["partner-listings"] });
              void qc.invalidateQueries({ queryKey: ["partner-listing-home"] });
              router.push("/listings" as never);
            },
          },
        ],
      );
    },
    onError: (err: any) => {
      const code = err?.code || "";
      const msg = err?.message || "";
      if (code === "listing_plan_cap" || msg.toLowerCase().includes("plan cap") || msg.toLowerCase().includes("active listing limit")) {
        setShowSubscription(true);
        setError("Active listing limit reached for your plan. Please upgrade to publish.");
      } else {
        setError(msg || "Could not publish job. Please try again.");
      }
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: (planId: string) => purchaseSubscription(planId),
    onSuccess: () => {
      setShowSubscription(false);
      Alert.alert("Success", "Subscription updated successfully!");
      void qc.invalidateQueries({ queryKey: ["partner-listing-home"] });
      void qc.invalidateQueries({ queryKey: ["vendor-subscriptions"] });
    },
    onError: (err: any) => {
      Alert.alert("Subscription Error", err?.message || "Failed to upgrade subscription.");
    },
  });

  function next() {
    setError(null);
    if (step === 0 && !draft.title.trim()) {
      return setError("Pick a job, or type a job title.");
    }
    if (step === 1) {
      if (!draft.jobType) return setError("Choose full time, part time or another job type.");
      if (!(Number(draft.salaryMin) > 0)) return setError("Choose a salary range, or type the pay.");
      if (draft.salaryMax && Number(draft.salaryMax) < Number(draft.salaryMin)) {
        return setError("The maximum salary must be at least the minimum.");
      }
    }
    if (step === 2 && draft.required.length === 0) {
      return setError("Pick at least one must-have skill.");
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  if (options.isLoading || (editId && existing.isLoading)) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-6">
        <Text className="text-sm text-text-muted">Loading job options…</Text>
      </View>
    );
  }

  if (options.error || !opts) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-6">
        <Text className="text-sm text-red-600">Failed to load job configuration.</Text>
      </View>
    );
  }

  const bandOn = (low: number, high: number) =>
    Number(draft.salaryMin) === low && (high ? Number(draft.salaryMax) === high : !draft.salaryMax);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-canvas"
    >
      {/* Top Header */}
      <View className="border-b border-line bg-surface px-4 pb-3 pt-4">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => {
              if (step === 0 || (editId && step === 1)) {
                router.back();
              } else {
                setStep(step - 1);
              }
            }}
            accessibilityLabel="Back"
            className="size-9 items-center justify-center rounded-full bg-surface-muted"
          >
            <ArrowLeft size={18} color="#00112e" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </Text>
            <Text className="text-base font-extrabold text-navy-900" numberOfLines={1}>
              {editId ? "Edit job opening" : "Post a job opening"}
              {draft.title && step > 0 ? ` · ${draft.title}` : ""}
            </Text>
          </View>
        </View>

        {/* Step Progress Indicators */}
        <View className="mt-3 flex-row gap-1.5">
          {STEPS.map((name, i) => (
            <View
              key={name}
              className={`h-1.5 flex-1 rounded-full ${
                i <= step ? "bg-amber-500" : "bg-line"
              }`}
            />
          ))}
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 16 }}
      >
        {/* Step 0: Job role / category selection */}
        {step === 0 ? (
          <Card className="gap-4 p-4">
            <Text className="text-base font-extrabold text-navy-900">
              What job are you hiring for?
            </Text>

            {/* Search Box */}
            <View className="flex-row items-center rounded-xl border border-line bg-surface px-3 py-2">
              <Search size={16} color="#94a3b8" />
              <TextInput
                placeholder="Search a job, e.g. cashier, driver, cook"
                placeholderTextColor="#94a3b8"
                value={search}
                onChangeText={setSearch}
                className="ml-2 flex-1 text-sm text-text"
              />
              {search ? (
                <Pressable onPress={() => setSearch("")}>
                  <X size={16} color="#94a3b8" />
                </Pressable>
              ) : null}
            </View>

            {/* Category Grid when no search text */}
            {!search ? (
              <View className="gap-2">
                <Text className="text-xs font-semibold text-text-muted">Choose a category</Text>
                <View className="flex-row flex-wrap gap-2">
                  {opts.categories.map((cat) => {
                    const isSelected = draft.category === cat.name;
                    return (
                      <Pressable
                        key={cat.name}
                        onPress={() => set({ category: cat.name })}
                        className={`rounded-xl border px-3.5 py-2.5 ${
                          isSelected
                            ? "border-navy-900 bg-navy-900"
                            : "border-line bg-surface"
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? "text-white" : "text-navy-900"
                          }`}
                        >
                          {cat.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Matching / Common Role Templates */}
            {roles.length > 0 ? (
              <View className="gap-2">
                <Text className="text-xs font-semibold text-text-muted">
                  {search ? "Matching jobs — tap to autofill" : "Common jobs in category — tap one"}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {roles.map(({ category, role }) => {
                    const isSelected = draft.templateId === role.id;
                    return (
                      <Pressable
                        key={role.id}
                        onPress={() => {
                          setDraft((d) => fromTemplate(d, category, role));
                          setStep(1);
                        }}
                        className={`rounded-full border px-4 py-2 ${
                          isSelected
                            ? "border-amber-500 bg-amber-50"
                            : "border-line bg-surface"
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? "text-amber-800" : "text-navy-900"
                          }`}
                        >
                          {role.name}
                          {search ? ` · ${category}` : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Manual Title Entry */}
            <View className="gap-1.5 border-t border-line/60 pt-3">
              <Text className="text-xs font-semibold text-text-muted">
                Not listed? Type custom job title:
              </Text>
              <TextInput
                placeholder="e.g. Jewellery Craftsman"
                placeholderTextColor="#94a3b8"
                maxLength={120}
                value={draft.templateId ? "" : draft.title}
                onChangeText={(title) => set({ title, templateId: null })}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-text"
              />
            </View>
          </Card>
        ) : null}

        {/* Step 1: The Basics */}
        {step === 1 ? (
          <Card className="gap-4 p-4">
            <Text className="text-base font-extrabold text-navy-900">Job Basics</Text>

            {/* Title */}
            <View className="gap-1.5">
              <Text className="text-xs font-semibold text-text-muted">Job title</Text>
              <TextInput
                value={draft.title}
                maxLength={120}
                onChangeText={(title) => set({ title })}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-text"
              />
            </View>

            {/* Vacancy Stepper */}
            <QuantityStepper
              label="How many vacancies do you have?"
              value={draft.vacancies}
              min={1}
              max={500}
              unit="people"
              decrementLabel="Decrease vacancies"
              incrementLabel="Increase vacancies"
              onChange={(vacancies) => set({ vacancies })}
            />

            {/* Job Type Chips */}
            <ChoiceChips
              label="Job type"
              name="job_type"
              options={opts.job_types.map((t) => ({ label: t.label, value: t.value }))}
              value={draft.jobType}
              onChange={(v) => set({ jobType: v })}
            />

            {/* Experience Band Chips */}
            <ChoiceChips
              label="Experience needed"
              name="experience"
              options={opts.experience_bands.map((b) => ({ label: b.label, value: b.value }))}
              value={draft.experience}
              onChange={(v) => set({ experience: v })}
            />

            {/* Monthly Salary Bands */}
            <View className="gap-2">
              <Text className="text-xs font-semibold text-text-muted">Monthly salary presets</Text>
              <View className="flex-row flex-wrap gap-2">
                {opts.salary_bands.map((band) => {
                  const on = bandOn(band.min_rupees, band.max_rupees);
                  return (
                    <Pressable
                      key={`${band.min_rupees}-${band.max_rupees}`}
                      onPress={() =>
                        set({
                          period: "MONTHLY",
                          salaryMin: String(band.min_rupees),
                          salaryMax: band.max_rupees ? String(band.max_rupees) : "",
                        })
                      }
                      className={`rounded-full border px-3 py-1.5 ${
                        on
                          ? "border-navy-900 bg-navy-900"
                          : "border-line bg-surface"
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          on ? "text-white" : "text-text"
                        }`}
                      >
                        {band.max_rupees
                          ? `${rupeesLabel(band.min_rupees)} – ${rupeesLabel(band.max_rupees)}`
                          : `${rupeesLabel(band.min_rupees)}+`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Exact Min and Max Inputs */}
              <View className="mt-2 flex-row gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-[11px] font-semibold text-text-muted">Min ₹ / month</Text>
                  <TextInput
                    keyboardType="numeric"
                    placeholder="15000"
                    placeholderTextColor="#94a3b8"
                    value={draft.salaryMin}
                    onChangeText={(salaryMin) => set({ salaryMin })}
                    className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-text"
                  />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-[11px] font-semibold text-text-muted">Max ₹ / month</Text>
                  <TextInput
                    keyboardType="numeric"
                    placeholder="25000"
                    placeholderTextColor="#94a3b8"
                    value={draft.salaryMax}
                    onChangeText={(salaryMax) => set({ salaryMax })}
                    className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-text"
                  />
                </View>
              </View>
            </View>

            {/* Salary Frequency / Period */}
            <ChoiceChips
              label="Salary period"
              name="salary_period"
              options={opts.salary_periods.map((p) => ({ label: p.label, value: p.value }))}
              value={draft.period}
              onChange={(v) => set({ period: v || "MONTHLY" })}
            />

            {/* Hiring Urgency */}
            <ChoiceChips
              label="How soon?"
              name="urgency"
              options={opts.urgencies.map((u) => ({ label: u.label, value: u.value }))}
              value={draft.urgency}
              onChange={(v) => set({ urgency: v || "NORMAL" })}
            />
          </Card>
        ) : null}

        {/* Step 2: Skills & Duties */}
        {step === 2 ? (
          <Card className="gap-5 p-4">
            <Text className="text-base font-extrabold text-navy-900">
              Skills & Requirements
            </Text>

            <TagPicker
              label="Must-have skills"
              hint="Candidates are matched on these first. Pick at least one."
              ideas={draft.skillIdeas}
              value={draft.required}
              exclude={draft.preferred}
              onChange={(required) => set({ required })}
              addLabel="Add a required skill"
            />

            <TagPicker
              label="Good-to-have skills"
              hint="Optional skills that give bonus match points."
              ideas={draft.skillIdeas}
              value={draft.preferred}
              exclude={draft.required}
              onChange={(preferred) => set({ preferred })}
              addLabel="Add a preferred skill"
            />

            {/* Expandable Accordion for More Options */}
            <Pressable
              onPress={() => setMoreOpen(!moreOpen)}
              className="flex-row items-center gap-1.5 pt-2"
            >
              <ChevronDown
                size={16}
                color="#0284c7"
                style={{ transform: [{ rotate: moreOpen ? "180deg" : "0deg" }] }}
              />
              <Text className="text-xs font-bold text-sky-700">
                {moreOpen ? "Hide extra details" : "More options (timings, benefits, languages, duties)"}
              </Text>
            </Pressable>

            {moreOpen ? (
              <View className="gap-4 border-t border-line/60 pt-4">
                {/* Shift */}
                <ChoiceChips
                  label="Shift"
                  name="shift"
                  options={opts.shifts.map((s) => ({ label: s.label, value: s.value }))}
                  value={draft.shift}
                  onChange={(v) => set({ shift: v })}
                />

                {/* Timing Start / End Pickers */}
                <View className="flex-row gap-3">
                  <TimePickerField
                    label="Starts at"
                    value={draft.timingStart}
                    onChange={(timingStart) => set({ timingStart })}
                  />
                  <TimePickerField
                    label="Ends at"
                    value={draft.timingEnd}
                    onChange={(timingEnd) => set({ timingEnd })}
                  />
                </View>

                {/* Weekly Off */}
                <ChoiceChips
                  label="Weekly off"
                  name="weekly_off"
                  options={opts.weekly_offs.map((w) => ({ label: w.label, value: w.value }))}
                  value={draft.weeklyOff}
                  onChange={(v) => set({ weeklyOff: v })}
                />

                {/* Workplace mode */}
                <ChoiceChips
                  label="Workplace mode"
                  name="work_mode"
                  options={opts.work_modes.map((w) => ({ label: w.label, value: w.value }))}
                  value={draft.workMode}
                  onChange={(v) => set({ workMode: v })}
                />

                {/* Benefits */}
                <TagPicker
                  label="Benefits & perks"
                  ideas={opts.benefits}
                  value={draft.benefits}
                  onChange={(benefits) => set({ benefits })}
                  addLabel="Add a benefit"
                />

                {/* Languages */}
                <MultiChoiceChips
                  label="Languages spoken"
                  name="languages"
                  options={opts.languages.map((l) => ({ label: l.label, value: l.value }))}
                  value={draft.languages}
                  onChange={(languages) => set({ languages })}
                />

                {/* Qualification */}
                <ChoiceChips
                  label="Minimum qualification"
                  name="qualification"
                  options={opts.qualifications.map((q) => ({ label: q.label, value: q.value }))}
                  value={draft.qualification}
                  onChange={(v) => set({ qualification: v })}
                />

                {/* Duties */}
                <TagPicker
                  label="Key responsibilities & duties"
                  ideas={draft.dutyIdeas}
                  value={draft.duties}
                  onChange={(duties) => set({ duties })}
                  addLabel="Add a duty"
                />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Step 3: Location & Preview */}
        {step === 3 ? (
          <View className="gap-4">
            <Card className="gap-4 p-4">
              <Text className="text-base font-extrabold text-navy-900">Where is the job?</Text>

              {/* City Chips */}
              <ChoiceChips
                label="City"
                name="city"
                options={opts.cities.map((city) => ({ label: city, value: city }))}
                value={draft.city}
                onChange={(city) => set({ city })}
              />

              {/* Custom City */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-text-muted">
                  Other city (if not listed above)
                </Text>
                <TextInput
                  placeholder="Type city name"
                  placeholderTextColor="#94a3b8"
                  value={opts.cities.includes(draft.city) ? "" : draft.city}
                  onChangeText={(city) => set({ city })}
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-text"
                />
              </View>

              {/* Area / Locality */}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-text-muted">Area / Locality</Text>
                <TextInput
                  placeholder="e.g. Kukatpally, Madhapur"
                  placeholderTextColor="#94a3b8"
                  maxLength={120}
                  value={draft.area}
                  onChangeText={(area) => set({ area })}
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-text"
                />
              </View>

              {!preview ? (
                <Button
                  variant="primary"
                  size="md"
                  loading={save.isPending}
                  disabled={!draft.city.trim()}
                  onPress={() => save.mutate(draft)}
                  className="mt-2 w-full flex-row items-center justify-center gap-2"
                >
                  <Sparkles size={16} color="#ffffff" />
                  <Text className="text-sm font-bold text-white">Generate Job Preview</Text>
                </Button>
              ) : null}
            </Card>

            {/* Generated Preview Card */}
            {preview ? (
              <Card className="gap-4 border-2 border-amber-500/30 p-4">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-lg font-extrabold text-navy-900">{preview.title}</Text>
                    <Text className="text-xs text-text-muted">
                      {preview.poster_name || "Your Company"}
                    </Text>
                  </View>
                  {draft.urgency !== "NORMAL" ? (
                    <Badge tone="warning">
                      {optionLabel(opts.urgencies, draft.urgency)}
                    </Badge>
                  ) : null}
                </View>

                {/* Key Summary Meta */}
                <View className="flex-row flex-wrap gap-3">
                  <View className="flex-row items-center gap-1">
                    <MapPin size={13} color="#64748b" />
                    <Text className="text-xs text-text-secondary">{preview.location_text || draft.city}</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <DollarSign size={13} color="#64748b" />
                    <Text className="text-xs text-text-secondary">
                      {rupeesLabel(Number(draft.salaryMin))}
                      {draft.salaryMax ? ` – ${rupeesLabel(Number(draft.salaryMax))}` : "+"}{" "}
                      {optionLabel(opts.salary_periods, draft.period)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Users size={13} color="#64748b" />
                    <Text className="text-xs text-text-secondary">{draft.vacancies} needed</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Briefcase size={13} color="#64748b" />
                    <Text className="text-xs text-text-secondary">
                      {optionLabel(opts.job_types, draft.jobType)}
                    </Text>
                  </View>
                </View>

                {/* Skills Badges */}
                <View className="flex-row flex-wrap gap-1.5">
                  {draft.required.map((skill) => (
                    <Badge key={skill} tone="info">{skill}</Badge>
                  ))}
                  {draft.preferred.map((skill) => (
                    <Badge key={skill}>{skill}</Badge>
                  ))}
                </View>

                {/* Description Box with Inline Edit */}
                {editingText ? (
                  <View className="gap-2">
                    <TextInput
                      multiline
                      numberOfLines={6}
                      maxLength={5000}
                      value={draft.description}
                      onChangeText={(description) => setDraft((d) => ({ ...d, description }))}
                      className="rounded-xl border border-line bg-surface p-3 text-xs leading-relaxed text-text"
                    />
                    <View className="flex-row gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        loading={save.isPending}
                        onPress={() => {
                          const nextDraft = { ...draft, ownDescription: true };
                          setDraft(nextDraft);
                          setEditingText(false);
                          save.mutate(nextDraft);
                        }}
                      >
                        Save Text
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => setEditingText(false)}
                      >
                        Cancel
                      </Button>
                    </View>
                  </View>
                ) : (
                  <View className="rounded-xl bg-surface-muted p-3">
                    <Text className="text-xs leading-relaxed text-text">
                      {draft.description}
                    </Text>
                    <Pressable onPress={() => setEditingText(true)} className="mt-2 self-start">
                      <Text className="text-xs font-bold text-sky-700">Edit description text</Text>
                    </Pressable>
                  </View>
                )}

                <Text className="text-[11px] text-text-muted">
                  Candidates are matched on the information they provide. Please interview them to confirm their skills and experience.
                </Text>
              </Card>
            ) : null}
          </View>
        ) : null}

        {/* Global Error Banner */}
        {error ? (
          <View className="rounded-xl border border-red-200 bg-red-50 p-3">
            <Text className="text-xs font-medium text-red-700">{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky Bottom Bar */}
      <View className="border-t border-line bg-surface p-3 shadow-sm">
        <View className="flex-row gap-2">
          {step < 3 ? (
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onPress={next}
            >
              Continue to Step {step + 2} →
            </Button>
          ) : preview ? (
            <>
              <Button
                variant="secondary"
                size="md"
                onPress={() => router.push("/listings" as never)}
                disabled={publish.isPending}
                className="px-4"
              >
                {draft.status === "PUBLISHED" ? "Close" : "Save Draft"}
              </Button>
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                loading={publish.isPending}
                onPress={() => publish.mutate()}
              >
                {draft.status === "PUBLISHED" ? "Done" : "Publish Job Opening"}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              disabled={!draft.city.trim()}
              loading={save.isPending}
              onPress={() => save.mutate(draft)}
            >
              See Preview
            </Button>
          )}
        </View>
      </View>

      {/* Subscription Dialog Modal */}
      <SubscriptionDialog
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
        plans={plansQuery.data ?? []}
        onSubscribe={(planId) => subscribeMutation.mutate(planId)}
        isPending={subscribeMutation.isPending}
      />
    </KeyboardAvoidingView>
  );
}
