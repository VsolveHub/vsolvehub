import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Alert,
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
  Minus,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react-native";

import { usePartnerApplication } from "@/features/application/queries";
import { handleFocusedBack, setFocusedBackHandler } from "@/features/session/focused-back";

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
} from "../queries";
import { jobCategoryLayout, rankRoleMatches } from "../job-categories";
import { ScrollFieldProvider, useKeyboardScroll, useScrollFieldIntoView } from "../use-keyboard-scroll";
import { usePlanPurchase } from "../use-plan-purchase";
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
type ChipOption = { label: string; value: string };

/** Compact option pill shared by every chip group in the wizard. */
function Chip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      testID={testID}
      className={`min-h-10 justify-center rounded-full border px-3.5 py-1.5 ${
        on ? "border-signal-500 bg-signal-50" : "border-line bg-surface"
      }`}
    >
      <Text className={`text-[13px] ${on ? "font-semibold text-text" : "font-medium text-text-secondary"}`}>{label}</Text>
    </Pressable>
  );
}

/** Pick one. Tapping the chosen option again clears it, as the shared chips did. */
function Chips({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: ChipOption[];
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-text">{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            on={value === option.value}
            testID={`${name}-${option.value}`}
            onPress={() => onChange(value === option.value ? "" : option.value)}
          />
        ))}
      </View>
    </View>
  );
}

/** Pick several. */
function MultiChips({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: ChipOption[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-text">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const on = value.includes(option.value);
          return (
            <Chip
              key={option.value}
              label={option.label}
              on={on}
              testID={`${name}-${option.value}`}
              onPress={() => onChange(on ? value.filter((v) => v !== option.value) : [...value, option.value])}
            />
          );
        })}
      </View>
    </View>
  );
}

/** How many people to hire: the label on the left, a small − count + control on the right. */
function VacancyStepper({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (next: number) => void;
}) {
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="flex-1 text-sm font-medium text-text">{label}</Text>
      <View className="flex-row items-center rounded-full border border-line bg-surface">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Decrease vacancies"
          accessibilityState={{ disabled: atMin }}
          disabled={atMin}
          hitSlop={4}
          onPress={() => onChange(Math.max(min, value - 1))}
          className={`size-10 items-center justify-center rounded-full active:bg-surface-hover ${atMin ? "opacity-30" : ""}`}
        >
          <Minus size={16} color="#071328" strokeWidth={2.2} />
        </Pressable>
        <Text className="min-w-16 text-center text-[15px] font-semibold text-text">
          {value} <Text className="text-xs font-normal text-text-muted">{unit}</Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Increase vacancies"
          accessibilityState={{ disabled: atMax }}
          disabled={atMax}
          hitSlop={4}
          onPress={() => onChange(Math.min(max, value + 1))}
          className={`size-10 items-center justify-center rounded-full active:bg-surface-hover ${atMax ? "opacity-30" : ""}`}
        >
          <Plus size={16} color="#071328" strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
}

/** One step of the wizard: a single white card with the step title on top. */
function StepCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-6 rounded-2xl border border-line bg-surface p-4">
      <Text className="text-xl font-bold tracking-tight text-text">{title}</Text>
      {children}
    </View>
  );
}

/** A titled group of fields inside a step: a quiet heading, then the fields. */
function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="text-sm font-semibold text-text">{title}</Text>
      {children}
    </View>
  );
}

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
  const scrollFieldIntoView = useScrollFieldIntoView();
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
      <Text className="text-sm font-semibold text-text">{label}</Text>
      {hint ? <Text className="-mt-1 text-xs text-text-muted">{hint}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {shown.map((idea) => {
          const on = value.includes(idea);
          return (
            <Pressable
              key={idea}
              onPress={() => onChange(on ? value.filter((v) => v !== idea) : [...value, idea])}
              className={`min-h-11 flex-row items-center gap-1.5 min-h-10 justify-center rounded-full border px-3.5 py-1.5 ${
                on
                  ? "border-signal-500 bg-signal-50"
                  : "border-line bg-surface"
              }`}
            >
              {on ? <Check size={14} color="#071328" /> : <Plus size={14} color="#756c5e" />}
              <Text className={`text-sm font-medium text-text`}>
                {idea}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View className="flex-row items-center gap-2">
        <TextInput
 onFocus={scrollFieldIntoView}
          placeholder={addLabel}
          placeholderTextColor="#a89f90"
          value={text}
          maxLength={60}
          onChangeText={setText}
          onSubmitEditing={add}
          returnKeyType="done"
          className="flex-1 h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-text"
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
      <Text className="text-sm font-medium text-text">{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        className="h-12 flex-row items-center justify-between rounded-xl border border-line bg-surface px-4"
      >
        <Text className="text-sm text-text">{value || "Pick time"}</Text>
        <Clock size={16} color="#756c5e" />
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
  const { scrollRef, keyboardHeight, keyboardOpen, keyboardGap, scrollFieldIntoView, onScroll } = useKeyboardScroll();
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
  const [showAllCategories, setShowAllCategories] = useState(false);
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

  useEffect(() => {
    const handler = () => {
      if (step === 0 || (editId && step === 1)) {
        router.back();
      } else {
        setStep((s) => s - 1);
      }
    };
    setFocusedBackHandler(handler);
    return () => setFocusedBackHandler(null);
  }, [step, editId, router]);

  const set = (patch: Partial<Draft>) => {
    setError(null);
    setPreview(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const opts = options.data as JobOptions | undefined;
  // Someone hiring for themselves sees household roles straight away; every other category stays
  // one tap away. A business sees the whole grid.
  const hiringAs = usePartnerApplication().data?.employer?.hiring_as;
  const layout = useMemo(() => jobCategoryLayout(opts?.categories ?? [], hiringAs), [opts, hiringAs]);
  const homeName = layout.home?.name ?? null;
  const roles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = (opts?.categories ?? []).flatMap((cat) =>
      cat.roles.map((role) => ({ category: cat.name, role })),
    );
    if (q) {
      return rankRoleMatches(
        all.filter(({ role, category }) => `${role.name} ${category}`.toLowerCase().includes(q)),
        hiringAs,
      );
    }
    // The household roles already have their own tiles above.
    if (homeName !== null && draft.category === homeName) return [];
    return all.filter(({ category }) => category === draft.category);
  }, [opts, search, draft.category, hiringAs, homeName]);
  // The grid opens when they ask, or when the job being edited already sits in one of its categories.
  const gridOpen =
    homeName === null || showAllCategories || (draft.category !== "" && draft.category !== homeName);

  const roleChip = (category: string, role: JobRoleTemplate) => {
    const isSelected = draft.templateId === role.id;
    return (
      <Pressable
        key={role.id}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        onPress={() => {
          setDraft((d) => fromTemplate(d, category, role));
          setStep(1);
        }}
        className={`min-h-10 justify-center rounded-full border px-3.5 py-1.5 ${
          isSelected ? "border-signal-500 bg-signal-50" : "border-line bg-surface"
        }`}
      >
        <Text className={`text-sm font-medium text-text`}>
          {role.name}
          {search ? ` · ${category}` : ""}
        </Text>
      </Pressable>
    );
  };

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

  const subscribeMutation = usePlanPurchase({
    beforeCheckout: () => setShowSubscription(false),
    onSettled: () => {
      setShowSubscription(false);
      void qc.invalidateQueries({ queryKey: ["partner-listing-home"] });
      void qc.invalidateQueries({ queryKey: ["vendor-subscriptions"] });
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
        <Text className="text-sm text-danger-text">Failed to load job configuration.</Text>
      </View>
    );
  }

  const bandOn = (low: number, high: number) =>
    Number(draft.salaryMin) === low && (high ? Number(draft.salaryMax) === high : !draft.salaryMax);

  return (
    <ScrollFieldProvider value={scrollFieldIntoView}>
    <View className="flex-1 bg-canvas">
      {/* Wizard Step Header */}
      <View className="border-b border-line bg-surface px-4 pb-5 pt-4">
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => handleFocusedBack(() => router.back())}
            hitSlop={8}
            className="-ml-1 size-10 items-center justify-center rounded-full active:bg-surface-hover"
          >
            <ArrowLeft size={20} color="#071328" />
          </Pressable>
          <Text className="flex-1 text-lg font-bold tracking-tight text-text" numberOfLines={1}>
            {editId ? "Edit job opening" : "Post a job opening"}
          </Text>
          <Text className="text-xs font-medium text-text-muted">
            Step {step + 1} of {STEPS.length}
          </Text>
        </View>

        {/* Step progress: one bar and one label per step. Labels wrap, so none is cut off. */}
        <View className="mt-6 flex-row items-start gap-3">
          {STEPS.map((name, i) => (
            <View key={name} className="flex-1 gap-2.5">
              <View className={`h-1.5 rounded-full ${i <= step ? "bg-signal-500" : "bg-line"}`} />
              <Text
                className={`text-xs leading-4 ${i === step ? "font-semibold text-text" : "text-text-muted"}`}
              >
                {name}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Error banner: right under the header so it is seen without scrolling */}
      {error ? (
        <View accessibilityRole="alert" className="mx-4 mt-4 rounded-xl border border-danger-line bg-danger-surface px-4 py-3">
          <Text className="text-sm font-medium text-danger-text">{error}</Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => onScroll(event.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        contentContainerStyle={{
          padding: 16,
          // Under the last field while typing: as tall as the keyboard, so it can scroll clear.
          paddingBottom: keyboardOpen ? keyboardHeight + keyboardGap : 32,
          gap: 16,
        }}
      >
        {/* Step 0: Job role / category selection */}
        {step === 0 ? (
          <StepCard title="What job are you hiring for?">

            {/* Search Box */}
            <View className="h-12 flex-row items-center rounded-xl border border-line bg-surface px-4">
              <Search size={16} color="#a89f90" />
              <TextInput
 onFocus={scrollFieldIntoView}
                placeholder="Search a job, e.g. cashier, driver, cook"
                placeholderTextColor="#a89f90"
                value={search}
                onChangeText={setSearch}
                className="ml-2 flex-1 text-base text-text"
              />
              {search ? (
                <Pressable onPress={() => setSearch("")}>
                  <X size={16} color="#a89f90" />
                </Pressable>
              ) : null}
            </View>

            {/* Someone hiring for themselves: household roles straight away */}
            {!search && layout.home ? (
              <View className="gap-2">
                <Text className="text-sm font-medium text-text">Help for your home — tap one</Text>
                <View className="flex-row flex-wrap gap-2">
                  {layout.home.roles.map((role) => roleChip(layout.home!.name, role))}
                </View>
              </View>
            ) : null}

            {/* Every other category, one tap away */}
            {!search && !gridOpen ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: false }}
                onPress={() => setShowAllCategories(true)}
                className="min-h-11 flex-row items-center justify-between gap-2 rounded-xl border border-dashed border-line px-3.5 py-2.5"
              >
                <Text className="flex-1 text-sm font-medium text-text-link">
                  Hiring for something else? Show all categories
                </Text>
                <ChevronDown size={16} color="#756c5e" />
              </Pressable>
            ) : null}

            {/* Category Grid when no search text */}
            {!search && gridOpen ? (
              <View className="gap-2">
                <Text className="text-sm font-medium text-text">Choose a category</Text>
                <View className="flex-row flex-wrap gap-2">
                  {layout.others.map((cat) => {
                    const isSelected = draft.category === cat.name;
                    return (
                      <Pressable
                        key={cat.name}
                        onPress={() => set({ category: cat.name })}
                        className={`min-h-10 justify-center rounded-xl border px-3.5 py-2 ${
                          isSelected
                            ? "border-signal-500 bg-signal-50"
                            : "border-line bg-surface"
                        }`}
                      >
                        <Text
                          className={`text-sm font-medium text-text`}
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
                <Text className="text-sm font-medium text-text">
                  {search ? "Matching jobs — tap to autofill" : "Common jobs in category — tap one"}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {roles.map(({ category, role }) => roleChip(category, role))}
                </View>
              </View>
            ) : null}

            {/* Manual Title Entry */}
            <View className="gap-1.5 border-t border-line pt-3">
              <Text className="text-sm font-medium text-text">
                Not listed? Type custom job title:
              </Text>
              <TextInput
 onFocus={scrollFieldIntoView}
                placeholder="e.g. Jewellery Craftsman"
                placeholderTextColor="#a89f90"
                maxLength={120}
                value={draft.templateId ? "" : draft.title}
                onChangeText={(title) => set({ title, templateId: null })}
                className="h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-text"
              />
            </View>
          </StepCard>
        ) : null}

        {/* Step 1: The Basics */}
        {step === 1 ? (
          <StepCard title="Job Basics">

            <FormSection title="Role">
            {/* Title */}
            <View className="gap-1.5">
              <Text className="text-sm font-medium text-text">Job title</Text>
              <TextInput
 onFocus={scrollFieldIntoView}
                value={draft.title}
                maxLength={120}
                onChangeText={(title) => set({ title })}
                className="h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-text"
              />
            </View>

            {/* Vacancy Stepper */}
            <VacancyStepper
              label="How many vacancies do you have?"
              value={draft.vacancies}
              min={1}
              max={500}
              unit="people"
              onChange={(vacancies) => set({ vacancies })}
            />

            </FormSection>

            <FormSection title="Employment">
            {/* Job Type Chips */}
            <Chips
              label="Job type"
              name="job_type"
              options={opts.job_types.map((t) => ({ label: t.label, value: t.value }))}
              value={draft.jobType}
              onChange={(v) => set({ jobType: v })}
            />

            {/* Experience Band Chips */}
            <Chips
              label="Experience needed"
              name="experience"
              options={opts.experience_bands.map((b) => ({ label: b.label, value: b.value }))}
              value={draft.experience}
              onChange={(v) => set({ experience: v })}
            />

            </FormSection>

            <FormSection title="Pay">
            {/* Monthly Salary Bands */}
            <View className="gap-2">
              <Text className="text-sm font-medium text-text">Monthly salary presets</Text>
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
                      className={`min-h-10 justify-center rounded-full border px-3.5 py-1.5 ${
                        on
                          ? "border-signal-500 bg-signal-50"
                          : "border-line bg-surface"
                      }`}
                    >
                      <Text className={`text-[13px] ${on ? "font-semibold text-text" : "font-medium text-text-secondary"}`}>
                        {band.max_rupees
                          ? `${rupeesLabel(band.min_rupees)} – ${rupeesLabel(band.max_rupees)}`
                          : `${rupeesLabel(band.min_rupees)}+`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Exact Min and Max Inputs */}
              <View className="mt-1 flex-row gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-xs font-medium text-text-secondary">Min ₹ / month</Text>
                  <TextInput
 onFocus={scrollFieldIntoView}
                    keyboardType="numeric"
                    placeholder="15000"
                    placeholderTextColor="#a89f90"
                    value={draft.salaryMin}
                    onChangeText={(salaryMin) => set({ salaryMin })}
                    className="h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-text"
                  />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-xs font-medium text-text-secondary">Max ₹ / month</Text>
                  <TextInput
 onFocus={scrollFieldIntoView}
                    keyboardType="numeric"
                    placeholder="25000"
                    placeholderTextColor="#a89f90"
                    value={draft.salaryMax}
                    onChangeText={(salaryMax) => set({ salaryMax })}
                    className="h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-text"
                  />
                </View>
              </View>
            </View>

            {/* Salary Frequency / Period */}
            <Chips
              label="Salary period"
              name="salary_period"
              options={opts.salary_periods.map((p) => ({ label: p.label, value: p.value }))}
              value={draft.period}
              onChange={(v) => set({ period: v || "MONTHLY" })}
            />

            </FormSection>

            <FormSection title="Hiring timeline">
            {/* Hiring Urgency */}
            <Chips
              label="How soon?"
              name="urgency"
              options={opts.urgencies.map((u) => ({ label: u.label, value: u.value }))}
              value={draft.urgency}
              onChange={(v) => set({ urgency: v || "NORMAL" })}
            />
          </FormSection>
          </StepCard>
        ) : null}

        {/* Step 2: Skills & Duties */}
        {step === 2 ? (
          <StepCard title="Skills & Requirements">
            <FormSection title="Skills">
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

            </FormSection>

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
              <Text className="text-sm font-semibold text-text-link">
                {moreOpen ? "Hide extra details" : "More options (timings, benefits, languages, duties)"}
              </Text>
            </Pressable>

            {moreOpen ? (
              <View className="gap-4 border-t border-line pt-4">
                {/* Shift */}
                <Chips
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
                <Chips
                  label="Weekly off"
                  name="weekly_off"
                  options={opts.weekly_offs.map((w) => ({ label: w.label, value: w.value }))}
                  value={draft.weeklyOff}
                  onChange={(v) => set({ weeklyOff: v })}
                />

                {/* Workplace mode */}
                <Chips
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
                <MultiChips
                  label="Languages spoken"
                  name="languages"
                  options={opts.languages.map((l) => ({ label: l.label, value: l.value }))}
                  value={draft.languages}
                  onChange={(languages) => set({ languages })}
                />

                {/* Qualification */}
                <Chips
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
          </StepCard>
        ) : null}

        {/* Step 3: Location & Preview */}
        {step === 3 ? (
          <View className="gap-4">
            <StepCard title="Where is the job?">
              <FormSection title="Location">

              {/* City Chips */}
              <Chips
                label="City"
                name="city"
                options={opts.cities.map((city) => ({ label: city, value: city }))}
                value={draft.city}
                onChange={(city) => set({ city })}
              />

              {/* Custom City */}
              <View className="gap-1.5">
                <Text className="text-sm font-medium text-text">
                  Other city (if not listed above)
                </Text>
                <TextInput
 onFocus={scrollFieldIntoView}
                  placeholder="Type city name"
                  placeholderTextColor="#a89f90"
                  value={opts.cities.includes(draft.city) ? "" : draft.city}
                  onChangeText={(city) => set({ city })}
                  className="h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-text"
                />
              </View>

              {/* Area / Locality */}
              <View className="gap-1.5">
                <Text className="text-sm font-medium text-text">Area / Locality</Text>
                <TextInput
 onFocus={scrollFieldIntoView}
                  placeholder="e.g. Kukatpally, Madhapur"
                  placeholderTextColor="#a89f90"
                  maxLength={120}
                  value={draft.area}
                  onChangeText={(area) => set({ area })}
                  className="h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-text"
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
                  <Text className="text-sm font-semibold text-white">Generate Job Preview</Text>
                </Button>
              ) : null}
            </FormSection>
            </StepCard>

            {/* Generated Preview Card */}
            {preview ? (
              <Card className="gap-4 border border-line p-4">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-lg font-semibold text-text">{preview.title}</Text>
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
                    <MapPin size={13} color="#756c5e" />
                    <Text className="text-xs text-text-secondary">{preview.location_text || draft.city}</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <DollarSign size={13} color="#756c5e" />
                    <Text className="text-xs text-text-secondary">
                      {rupeesLabel(Number(draft.salaryMin))}
                      {draft.salaryMax ? ` – ${rupeesLabel(Number(draft.salaryMax))}` : "+"}{" "}
                      {optionLabel(opts.salary_periods, draft.period)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Users size={13} color="#756c5e" />
                    <Text className="text-xs text-text-secondary">{draft.vacancies} needed</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Briefcase size={13} color="#756c5e" />
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
 onFocus={scrollFieldIntoView}
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
                      <Text className="text-sm font-semibold text-text-link">Edit description text</Text>
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

      </ScrollView>

      {/* Sticky Bottom Bar: steps aside while typing so it cannot cover a field */}
      {keyboardOpen ? null : (
      <View className="border-t border-line bg-surface px-4 pb-5 pt-3">
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
      )}

      {/* Subscription Dialog Modal */}
      <SubscriptionDialog
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
        plans={plansQuery.data ?? []}
        onSubscribe={(planId) => subscribeMutation.mutate(planId)}
        isPending={subscribeMutation.isPending}
      />
    </View>
    </ScrollFieldProvider>
  );
}
