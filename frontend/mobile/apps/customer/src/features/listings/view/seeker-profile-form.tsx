import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileUp,
  Plus,
  Search,
  X,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";

import { fetchJobOptions, type JobOptions } from "../queries";
import {
  fetchMyJobProfile,
  saveMyJobProfile,
  uploadProfileResume,
  type JobProfile,
} from "../seeker-queries";
import { THEME_COLORS } from "../theme-colors";
import { useResumeUpload } from "../use-document-upload";

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

type FormState = {
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
  visibility: "OPEN" | "APPLIED_ONLY";
};

const EMPTY: FormState = {
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

export function SeekerProfileForm({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pickDocument } = useResumeUpload();

  const optionsQuery = useQuery({
    queryKey: ["job-options"],
    queryFn: fetchJobOptions,
    staleTime: 3600_000,
  });

  const profileQuery = useQuery({
    queryKey: ["my-job-profile"],
    queryFn: fetchMyJobProfile,
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [roleSearch, setRoleSearch] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [customSkill, setCustomSkill] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([profileQuery.refetch(), optionsQuery.refetch()]);
    setRefreshing(false);
  };

  // Render-time state synchronization pattern (strictly avoids react-hooks/set-state-in-effect)
  const [prevProfile, setPrevProfile] = useState<unknown>(null);
  if (profileQuery.data && profileQuery.data !== prevProfile) {
    setPrevProfile(profileQuery.data);
    const p = profileQuery.data;
    setForm({
      full_name: p.full_name || p.name || "",
      roles: (p.roles as string[]) || [],
      skills: (p.skills as string[]) || [],
      experience_band: p.experience_band || "",
      qualification: p.qualification || "",
      languages: (p.languages as string[]) || ["TELUGU"],
      city: p.city || "",
      area: p.area || "",
      expected_salary_rupees: p.expected_salary_rupees ? String(p.expected_salary_rupees) : "",
      job_types: (p.job_types as string[]) || ["FULL_TIME"],
      available_from: p.available_from || "IMMEDIATE",
      visibility: p.visibility === "APPLIED_ONLY" ? "APPLIED_ONLY" : "OPEN",
    });
  }

  const opts = optionsQuery.data as JobOptions | undefined;

  const allRoles = useMemo(() => {
    return (opts?.categories ?? []).flatMap((cat) =>
      cat.roles.map((r) => ({ ...r, category: cat.name })),
    );
  }, [opts]);

  const roleHits = useMemo(() => {
    if (!roleSearch.trim()) return [];
    const q = roleSearch.trim().toLowerCase();
    return allRoles.filter((r) => `${r.name} ${r.category}`.toLowerCase().includes(q)).slice(0, 10);
  }, [allRoles, roleSearch]);

  const skillIdeas = useMemo(() => {
    const ideas = allRoles
      .filter((r) => form.roles.includes(r.name))
      .flatMap((r) => r.skills);
    return Array.from(new Set([...ideas, ...form.skills]));
  }, [allRoles, form.roles, form.skills]);

  const toggleRole = (name: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (form.roles.includes(name)) {
      setForm((prev) => ({ ...prev, roles: prev.roles.filter((r) => r !== name) }));
      return;
    }
    if (form.roles.length >= 3) {
      setErrorMessage("You can select up to 3 preferred job roles.");
      return;
    }
    setForm((prev) => ({ ...prev, roles: [...prev.roles, name] }));
  };

  const toggleSkill = (skill: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter((s) => s !== skill)
        : [...prev.skills, skill],
    }));
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      saveMyJobProfile({
        ...form,
        expected_salary_rupees: Number(form.expected_salary_rupees.replace(/[,\s₹]/g, "")) || 0,
        is_findable: form.visibility === "OPEN",
        findable: form.visibility === "OPEN",
      }),
    onSuccess: (data: JobProfile) => {
      queryClient.setQueryData(["my-job-profile"], data);
      void queryClient.invalidateQueries({ queryKey: ["jobs-for-you"] });
      setSuccessMessage("Your job profile has been saved successfully!");
      if (returnTo) {
        router.push(returnTo as never);
      }
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || "Failed to save job profile.");
    },
  });

  const uploadResumeMutation = useMutation({
    mutationFn: (file: { uri: string; name: string; type?: string }) =>
      uploadProfileResume(file),
    onSuccess: (data: JobProfile) => {
      queryClient.setQueryData(["my-job-profile"], data);
      setSuccessMessage("Resume uploaded successfully.");
    },
    onError: (err: any) => {
      setErrorMessage(err?.message || "Failed to upload resume.");
    },
  });

  const handlePickResume = async () => {
    setErrorMessage(null);
    const picked = await pickDocument();
    if (picked) {
      uploadResumeMutation.mutate({
        uri: picked.uri,
        name: picked.name,
        type: picked.mimeType,
      });
    }
  };

  const handleSave = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!form.full_name.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (form.roles.length === 0) {
      setErrorMessage("Please select at least one preferred job role.");
      return;
    }
    if (!form.city.trim()) {
      setErrorMessage("Please select or enter your city.");
      return;
    }
    saveMutation.mutate();
  };

  if (profileQuery.isLoading || optionsQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center p-8">
        <ActivityIndicator color="#00112e" />
      </View>
    );
  }

  const profileData = profileQuery.data;

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-5 pb-24"
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[THEME_COLORS.action]}
          tintColor={THEME_COLORS.action}
        />
      }
    >
      {/* Alert Notices */}
      {errorMessage ? (
        <View className="flex-row items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <AlertCircle size={16} color={THEME_COLORS.danger} />
          <Text className="flex-1 text-xs font-bold text-rose-700">{errorMessage}</Text>
        </View>
      ) : null}

      {successMessage ? (
        <View className="flex-row items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <CheckCircle2 size={16} color={THEME_COLORS.success} />
          <Text className="flex-1 text-xs font-bold text-emerald-800">{successMessage}</Text>
        </View>
      ) : null}

      {/* 1. Full Name */}
      <View className="gap-1.5 rounded-2xl border border-line bg-surface p-4 shadow-xs">
        <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
          Your Full Name *
        </Text>
        <TextInput
          value={form.full_name}
          onChangeText={(v) => setForm((prev) => ({ ...prev, full_name: v }))}
          placeholder="e.g. Rahul Sharma"
          placeholderTextColor="rgba(107,101,96,0.5)"
          className="rounded-xl border border-line bg-canvas p-3 text-xs text-navy-900"
        />
      </View>

      {/* 2. Preferred Roles (Up to 3) */}
      <View className="gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
        <View className="gap-0.5">
          <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
            Jobs You Want * (Pick up to 3)
          </Text>
          <Text className="text-[11px] text-text-muted">
            Tap the job roles that match your career goals
          </Text>
        </View>

        {/* Selected Roles */}
        {form.roles.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {form.roles.map((r) => (
              <Pressable
                key={r}
                onPress={() => toggleRole(r)}
                className="flex-row items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5"
              >
                <Check size={12} color="#ffffff" />
                <Text className="text-xs font-bold text-white">{r}</Text>
                <X size={12} color="#ffffff" />
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Role Search */}
        <View className="flex-row items-center rounded-xl bg-canvas px-3 py-2 border border-line">
          <Search size={14} color="#6B6560" />
          <TextInput
            placeholder="Search roles (e.g. sales, electrician, technician)"
            placeholderTextColor="rgba(107,101,96,0.5)"
            value={roleSearch}
            onChangeText={setRoleSearch}
            className="ml-2 flex-1 text-xs text-navy-900"
          />
        </View>

        {/* Role Hits */}
        {roleHits.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5">
            {roleHits.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => {
                  toggleRole(r.name);
                  setRoleSearch("");
                }}
                className="flex-row items-center gap-1 rounded-full border border-line bg-canvas px-3 py-1 active:border-brand"
              >
                <Plus size={11} color={THEME_COLORS.action} />
                <Text className="text-xs font-semibold text-navy-900">{r.name}</Text>
                <Text className="text-[10px] text-text-muted">· {r.category}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Popular Category Suggestions */}
        {!roleSearch && opts ? (
          <View className="flex-row flex-wrap gap-1.5">
            {opts.categories
              .slice(0, 5)
              .flatMap((cat) => cat.roles.slice(0, 1))
              .filter((r) => !form.roles.includes(r.name))
              .map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() => toggleRole(r.name)}
                  className="flex-row items-center gap-1 rounded-full border border-line bg-canvas px-3 py-1 active:border-brand"
                >
                  <Plus size={11} color="#6B6560" />
                  <Text className="text-xs font-medium text-text-secondary">{r.name}</Text>
                </Pressable>
              ))}
          </View>
        ) : null}

        {/* Custom Role Input */}
        <View className="flex-row gap-2">
          <TextInput
            placeholder="Not listed? Type a role"
            placeholderTextColor="rgba(107,101,96,0.5)"
            value={customRole}
            onChangeText={setCustomRole}
            className="flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-navy-900"
          />
          <Pressable
            disabled={!customRole.trim()}
            onPress={() => {
              toggleRole(customRole.trim());
              setCustomRole("");
            }}
            className={`rounded-xl px-4 items-center justify-center ${
              customRole.trim() ? "bg-navy-900 active:bg-navy-800" : "bg-line"
            }`}
          >
            <Text className="text-xs font-bold text-white">Add</Text>
          </Pressable>
        </View>
      </View>

      {/* 3. Skills */}
      <View className="gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
        <View className="gap-0.5">
          <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
            Your Skills
          </Text>
          <Text className="text-[11px] text-text-muted">
            {form.roles.length
              ? "Tap the skills you possess to boost your match scores"
              : "Pick roles above to view suggested skills"}
          </Text>
        </View>

        {skillIdeas.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5">
            {skillIdeas.map((s) => {
              const on = form.skills.includes(s);
              return (
                <Pressable
                  key={s}
                  onPress={() => toggleSkill(s)}
                  className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 border ${
                    on
                      ? "border-brand bg-brand/10"
                      : "border-line bg-canvas active:bg-surface-hover"
                  }`}
                >
                  {on ? <Check size={11} color={THEME_COLORS.action} /> : <Plus size={11} color={THEME_COLORS.muted} />}
                  <Text
                    className={`text-xs font-semibold ${
                      on ? "text-brand" : "text-text-secondary"
                    }`}
                  >
                    {s}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View className="flex-row gap-2">
          <TextInput
            placeholder="Add custom skill"
            placeholderTextColor="rgba(107,101,96,0.5)"
            value={customSkill}
            onChangeText={setCustomSkill}
            className="flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-navy-900"
          />
          <Pressable
            disabled={!customSkill.trim()}
            onPress={() => {
              const v = customSkill.trim();
              if (!form.skills.includes(v)) {
                setForm((prev) => ({ ...prev, skills: [...prev.skills, v] }));
              }
              setCustomSkill("");
            }}
            className={`rounded-xl px-4 items-center justify-center ${
              customSkill.trim() ? "bg-navy-900 active:bg-navy-800" : "bg-line"
            }`}
          >
            <Text className="text-xs font-bold text-white">Add</Text>
          </Pressable>
        </View>
      </View>

      {/* 4. Experience Band */}
      {opts?.experience_bands ? (
        <View className="gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
            Work Experience
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {opts.experience_bands
              .filter((o) => o.value !== "ANY")
              .map((b) => {
                const isSelected = form.experience_band === b.value;
                return (
                  <Pressable
                    key={b.value}
                    onPress={() =>
                      setForm((prev) => ({
                        ...prev,
                        experience_band: isSelected ? "" : b.value,
                      }))
                    }
                    className={`rounded-full px-3.5 py-1.5 border ${
                      isSelected
                        ? "border-navy-900 bg-navy-900"
                        : "border-line bg-canvas active:bg-surface-hover"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? "text-white" : "text-text-secondary"
                      }`}
                    >
                      {b.label}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
        </View>
      ) : null}

      {/* 5. Qualifications */}
      {opts?.qualifications ? (
        <View className="gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
            Highest Qualification
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {opts.qualifications.map((q) => {
              const isSelected = form.qualification === q.value;
              return (
                <Pressable
                  key={q.value}
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      qualification: isSelected ? "" : q.value,
                    }))
                  }
                  className={`rounded-full px-3.5 py-1.5 border ${
                    isSelected
                      ? "border-navy-900 bg-navy-900"
                      : "border-line bg-canvas active:bg-surface-hover"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isSelected ? "text-white" : "text-text-secondary"
                    }`}
                  >
                    {q.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* 6. Languages Multi-Choice */}
      {opts?.languages ? (
        <View className="gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
            Languages You Speak
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {opts.languages.map((l) => {
              const isSelected = form.languages.includes(l.value);
              return (
                <Pressable
                  key={l.value}
                  onPress={() => {
                    setForm((prev) => ({
                      ...prev,
                      languages: isSelected
                        ? prev.languages.filter((x) => x !== l.value)
                        : [...prev.languages, l.value],
                    }));
                  }}
                  className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5 border ${
                    isSelected
                      ? "border-brand bg-brand"
                      : "border-line bg-canvas active:bg-surface-hover"
                  }`}
                >
                  {isSelected ? <Check size={11} color={THEME_COLORS.white} /> : null}
                  <Text
                    className={`text-xs font-bold ${
                      isSelected ? "text-white" : "text-text-secondary"
                    }`}
                  >
                    {l.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* 7. Location & City */}
      <View className="gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
        <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
          Where Do You Live? *
        </Text>

        {opts?.cities ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 pb-1"
          >
            {opts.cities.map((c) => {
              const isSelected = form.city === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setForm((prev) => ({ ...prev, city: isSelected ? "" : c }))}
                  className={`rounded-full px-3.5 py-1.5 border ${
                    isSelected
                      ? "border-navy-900 bg-navy-900"
                      : "border-line bg-canvas active:bg-surface-hover"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isSelected ? "text-white" : "text-text-secondary"
                    }`}
                  >
                    {c}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View className="flex-row gap-2">
          <TextInput
            placeholder="Other city"
            placeholderTextColor="rgba(107,101,96,0.5)"
            value={opts?.cities.includes(form.city) ? "" : form.city}
            onChangeText={(v) => setForm((prev) => ({ ...prev, city: v }))}
            className="flex-1 rounded-xl border border-line bg-canvas p-3 text-xs text-navy-900"
          />
          <TextInput
            placeholder="Area / Locality (e.g. Hitech City)"
            placeholderTextColor="rgba(107,101,96,0.5)"
            value={form.area}
            onChangeText={(v) => setForm((prev) => ({ ...prev, area: v }))}
            className="flex-1 rounded-xl border border-line bg-canvas p-3 text-xs text-navy-900"
          />
        </View>
      </View>

      {/* 8. Expected Monthly Salary */}
      <View className="gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
        <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
          Expected Monthly Salary (₹)
        </Text>

        <View className="flex-row flex-wrap gap-2">
          {[12000, 15000, 20000, 25000, 30000, 40000].map((n) => {
            const isSelected = Number(form.expected_salary_rupees) === n;
            return (
              <Pressable
                key={n}
                onPress={() =>
                  setForm((prev) => ({
                    ...prev,
                    expected_salary_rupees: isSelected ? "" : String(n),
                  }))
                }
                className={`rounded-full px-3.5 py-1.5 border ${
                  isSelected
                    ? "border-brand bg-brand"
                    : "border-line bg-canvas active:bg-surface-hover"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? "text-white" : "text-text-secondary"
                  }`}
                >
                  ₹{n.toLocaleString("en-IN")}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          placeholder="Or enter amount (e.g. 35000)"
          placeholderTextColor="rgba(107,101,96,0.5)"
          keyboardType="numeric"
          value={form.expected_salary_rupees}
          onChangeText={(v) => setForm((prev) => ({ ...prev, expected_salary_rupees: v }))}
          className="rounded-xl border border-line bg-canvas p-3 text-xs text-navy-900"
        />
      </View>

      {/* 9. Preferred Job Types */}
      {opts?.job_types ? (
        <View className="gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
            Preferred Job Types
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {opts.job_types.map((jt) => {
              const isSelected = form.job_types.includes(jt.value);
              return (
                <Pressable
                  key={jt.value}
                  onPress={() => {
                    setForm((prev) => ({
                      ...prev,
                      job_types: isSelected
                        ? prev.job_types.filter((x) => x !== jt.value)
                        : [...prev.job_types, jt.value],
                    }));
                  }}
                  className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5 border ${
                    isSelected
                      ? "border-navy-900 bg-navy-900"
                      : "border-line bg-canvas active:bg-surface-hover"
                  }`}
                >
                  {isSelected ? <Check size={11} color={THEME_COLORS.white} /> : null}
                  <Text
                    className={`text-xs font-bold ${
                      isSelected ? "text-white" : "text-text-secondary"
                    }`}
                  >
                    {jt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* 10. Availability */}
      <View className="gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-xs">
        <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
          When Can You Join?
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {AVAILABILITY.map((av) => {
            const isSelected = form.available_from === av.value;
            return (
              <Pressable
                key={av.value}
                onPress={() => setForm((prev) => ({ ...prev, available_from: av.value }))}
                className={`rounded-full px-3.5 py-1.5 border ${
                  isSelected
                    ? "border-navy-900 bg-navy-900"
                    : "border-line bg-canvas active:bg-surface-hover"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? "text-white" : "text-text-secondary"
                  }`}
                >
                  {av.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 11. Resume Upload */}
      <View className="gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-xs">
        <View className="gap-0.5">
          <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
            Resume (Optional)
          </Text>
          <Text className="text-[11px] text-text-muted">
            PDF, DOC, or DOCX up to 5 MB. Automatically shared when you apply.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={uploadResumeMutation.isPending}
          onPress={handlePickResume}
          className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-brand/50 bg-brand/5 py-3 active:bg-brand/10"
        >
          {uploadResumeMutation.isPending ? (
            <ActivityIndicator size="small" color={THEME_COLORS.action} />
          ) : (
            <>
              <FileUp size={16} color={THEME_COLORS.action} />
              <Text className="text-xs font-bold text-brand">
                {profileData?.has_resume
                  ? `Replace ${profileData.resume_name || "Resume"}`
                  : "Upload Resume File"}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* 12. Visibility */}
      <View className="gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-xs">
        <View className="gap-0.5">
          <Text className="text-xs font-extrabold uppercase tracking-wider text-navy-900">
            Who Can Discover Your Profile?
          </Text>
          <Text className="text-[11px] text-text-muted">
            Your phone number is only revealed to employers when you apply.
          </Text>
        </View>

        <View className="gap-2">
          {VISIBILITY.map((vis) => {
            const isSelected = form.visibility === vis.value;
            return (
              <Pressable
                key={vis.value}
                onPress={() =>
                  setForm((prev) => ({
                    ...prev,
                    visibility: vis.value as "OPEN" | "APPLIED_ONLY",
                  }))
                }
                className={`flex-row items-center justify-between rounded-xl p-3 border ${
                  isSelected
                    ? "border-navy-900 bg-canvas"
                    : "border-line bg-surface active:bg-canvas"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? "text-navy-900" : "text-text-secondary"
                  }`}
                >
                  {vis.label}
                </Text>
                {isSelected ? <Check size={14} color={THEME_COLORS.navy900} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Save Button */}
      <Button
        size="lg"
        variant="primary"
        disabled={saveMutation.isPending}
        onPress={handleSave}
        className="mt-2 rounded-xl py-3.5"
      >
        {saveMutation.isPending ? (
          <ActivityIndicator color={THEME_COLORS.white} size="small" />
        ) : (
          "Save Job Profile"
        )}
      </Button>
    </ScrollView>
  );
}
