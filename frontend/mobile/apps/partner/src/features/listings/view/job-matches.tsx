import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, Skeleton, Text } from "@vsolve/mobile-ui";
import {
  Briefcase,
  Check,
  CheckCircle2,
  GraduationCap,
  Languages,
  Lock,
  MapPin,
  Send,
  X,
} from "lucide-react-native";

import {
  fetchJobMatches,
  fetchJobOptions,
  inviteToApply,
  optionLabel,
} from "../jobs-queries";
import type { CandidateMatch } from "../model";
import { fetchListingHome } from "../queries";
import { THEME_COLORS } from "../theme-colors";

const LEVELS = [
  { key: "STRONG", label: "Strong", tone: "success" as const },
  { key: "GOOD", label: "Good", tone: "info" as const },
  { key: "OTHER", label: "Others", tone: "neutral" as const },
];

export interface JobMatchesProps {
  listingId: string;
  onOpenApplications: () => void;
  onOpenSubscription?: () => void;
  hiddenMatchCount?: number;
}

export function JobMatches({
  listingId,
  onOpenApplications,
  onOpenSubscription,
  hiddenMatchCount = 0,
}: JobMatchesProps) {
  const [level, setLevel] = useState("STRONG");
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateMatch | null>(null);

  const home = useQuery({
    queryKey: ["partner-listing-home"],
    queryFn: fetchListingHome,
  });
  const locked = home.data ? !home.data.can_see_matches : false;

  const matches = useQuery({
    queryKey: ["job-matches", listingId],
    queryFn: () => fetchJobMatches(listingId),
  });

  const options = useQuery({
    queryKey: ["job-options"],
    queryFn: fetchJobOptions,
    staleTime: 3600_000,
  });

  const invite = useMutation({
    mutationFn: (profileId: string) => inviteToApply(listingId, profileId),
    onSuccess: (_d, profileId) => {
      setInvited((s) => new Set(s).add(profileId));
      Alert.alert("Invitation Sent", "Candidate has been invited to apply for this opening.");
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to send invitation.");
    },
  });

  const rows = matches.data ?? [];
  const counts = Object.fromEntries(
    LEVELS.map((l) => [l.key, rows.filter((r) => r.match.level === l.key).length]),
  );
  const shown = rows.filter((r) => r.match.level === level);

  return (
    <View className="gap-4">
      {/* Level Filter Tabs */}
      <View className="flex-row gap-2">
        {LEVELS.map((l) => {
          const isSelected = level === l.key;
          return (
            <Pressable
              key={l.key}
              onPress={() => setLevel(l.key)}
              className={`rounded-full px-3.5 py-1.5 border ${
                isSelected
                  ? "border-navy-900 bg-navy-900"
                  : "border-line bg-surface"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  isSelected ? "text-white" : "text-text-secondary"
                }`}
              >
                {l.label} ({counts[l.key] ?? 0})
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Subscription Lock Notice */}
      {locked ? (
        <Card className="gap-3 border-amber-300 bg-amber-50/70 p-4">
          <View className="flex-row items-start gap-2.5">
            <View className="mt-0.5 size-7 items-center justify-center rounded-full bg-amber-200">
              <Lock size={14} color={THEME_COLORS.warning} />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold text-amber-950">
                {hiddenMatchCount > 0
                  ? `${hiddenMatchCount} matching ${hiddenMatchCount === 1 ? "candidate" : "candidates"} available`
                  : "Discover matching candidates before they apply"}
              </Text>
              <Text className="mt-1 text-[11px] leading-relaxed text-amber-800">
                Upgrade your hiring plan to reveal and directly invite qualified candidates in your city.
              </Text>
            </View>
          </View>
          {onOpenSubscription ? (
            <Button
              variant="primary"
              size="sm"
              onPress={onOpenSubscription}
              className="self-start"
            >
              View Hiring Plans
            </Button>
          ) : null}
        </Card>
      ) : null}

      <Text className="text-[11px] text-text-muted">
        Candidates are matched against required skills and experience. Interview them to verify qualifications.
      </Text>

      {/* Loading Skeleton */}
      {matches.isLoading ? (
        <View className="gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="gap-2.5 p-4">
              <Skeleton className="h-5 w-40 rounded-md" />
              <Skeleton className="h-3.5 w-60 rounded-md" />
              <Skeleton className="h-10 w-full rounded-md" />
            </Card>
          ))}
        </View>
      ) : matches.isError ? (
        <Card className="items-center p-6 text-center">
          <Text className="text-sm font-semibold text-red-600">
            Failed to load candidate matches.
          </Text>
          <Button
            variant="secondary"
            size="sm"
            onPress={() => void matches.refetch()}
            className="mt-3"
          >
            Retry
          </Button>
        </Card>
      ) : shown.length === 0 ? (
        <EmptyState
          title="No candidates in this tier"
          description={
            locked
              ? "Candidates who apply will appear here with match breakdown."
              : "As job seekers update their profiles in your city, matches appear here."
          }
        />
      ) : (
        <View className="gap-3">
          {shown.map((row: CandidateMatch) => {
            const look = LEVELS.find((l) => l.key === row.match.level) ?? LEVELS[2]!;
            const hasInvited = invited.has(row.profile_id);

            return (
              <Card
                key={row.profile_id}
                className="gap-3 border border-line bg-surface p-4 shadow-xs"
              >
                <Pressable
                  onPress={() => setSelectedCandidate(row)}
                  className="gap-1.5"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-base font-extrabold text-navy-900">
                      {row.display_name}
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                      <Badge tone={look.tone}>{row.match.score}% match</Badge>
                      {row.applied ? <Badge tone="brand">Applied</Badge> : null}
                    </View>
                  </View>

                  <Text className="text-xs text-text-secondary">
                    {[
                      optionLabel(options.data?.experience_bands, row.experience_band),
                      row.expected_salary_rupees
                        ? `expects ₹${row.expected_salary_rupees.toLocaleString("en-IN")}`
                        : "",
                      row.available_from
                        ? `joins ${row.available_from === "IMMEDIATE" ? "immediately" : "soon"}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>

                  {row.area || row.city ? (
                    <View className="flex-row items-center gap-1">
                      <MapPin size={12} color="#64748b" />
                      <Text className="text-[11px] text-text-muted">
                        {[row.area, row.city].filter(Boolean).join(", ")}
                      </Text>
                    </View>
                  ) : null}

                  {/* Matched vs Missing Skills breakdown */}
                  <View className="mt-1 gap-1">
                    {row.match.matched.slice(0, 3).map((m: string) => (
                      <View key={m} className="flex-row items-center gap-1.5">
                        <Check size={12} color="#16a34a" />
                        <Text className="text-xs text-emerald-800 font-medium">{m}</Text>
                      </View>
                    ))}
                    {row.match.missing.slice(0, 2).map((m: string) => (
                      <View key={m} className="flex-row items-center gap-1.5">
                        <Text className="text-[11px] text-amber-600 font-bold">△</Text>
                        <Text className="text-xs text-text-muted">{m}</Text>
                      </View>
                    ))}
                  </View>
                </Pressable>

                {/* Action Row */}
                <View className="mt-1 flex-row items-center justify-between border-t border-line/60 pt-2.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => setSelectedCandidate(row)}
                    className="h-8 px-2"
                  >
                    <Text className="text-xs font-semibold text-sky-700">View Full Profile</Text>
                  </Button>

                  {row.applied ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={onOpenApplications}
                      className="h-8 px-3"
                    >
                      View Application
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={hasInvited || invite.isPending}
                      loading={invite.isPending && invite.variables === row.profile_id}
                      onPress={() => invite.mutate(row.profile_id)}
                      className="h-8 flex-row items-center gap-1.5 px-3"
                    >
                      {hasInvited ? (
                        <>
                          <CheckCircle2 size={12} color="#ffffff" />
                          <Text className="text-xs font-bold text-white">Invited</Text>
                        </>
                      ) : (
                        <>
                          <Send size={12} color="#ffffff" />
                          <Text className="text-xs font-bold text-white">Invite to Apply</Text>
                        </>
                      )}
                    </Button>
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {/* Candidate Full Profile Drawer / Modal (W-154, W-178) */}
      <Modal
        visible={selectedCandidate !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedCandidate(null)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View className="max-h-[85%] rounded-t-3xl bg-surface p-5 gap-4">
            <View className="flex-row items-center justify-between border-b border-line pb-3">
              <View className="flex-1">
                <Text className="text-lg font-extrabold text-navy-900">
                  {selectedCandidate?.display_name}
                </Text>
                <Text className="text-xs text-text-muted">
                  Candidate Profile Details
                </Text>
              </View>
              <Pressable
                hitSlop={8}
                onPress={() => setSelectedCandidate(null)}
                className="size-8 items-center justify-center rounded-full bg-surface-muted"
              >
                <X size={18} color="#00112e" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
              {/* Match Highlights */}
              <View className="rounded-2xl border border-line bg-surface-muted p-3.5 gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs font-bold text-navy-900">Match Analysis</Text>
                  <Badge tone={LEVELS.find((l) => l.key === selectedCandidate?.match.level)?.tone || "info"}>
                    {selectedCandidate?.match.score}% Score
                  </Badge>
                </View>

                <View className="gap-1 mt-1">
                  <Text className="text-[11px] font-bold text-emerald-800">Matching Skills:</Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {selectedCandidate?.match.matched.map((skill: string) => (
                      <Badge key={skill} tone="success">{skill}</Badge>
                    ))}
                  </View>

                  {selectedCandidate?.match.missing.length ? (
                    <>
                      <Text className="text-[11px] font-bold text-amber-800 mt-2">Missing Skills:</Text>
                      <View className="flex-row flex-wrap gap-1.5">
                        {selectedCandidate?.match.missing.map((skill: string) => (
                          <Badge key={skill} tone="warning">{skill}</Badge>
                        ))}
                      </View>
                    </>
                  ) : null}
                </View>
              </View>

              {/* Roles & Qualifications */}
              <View className="gap-2">
                <Text className="text-xs font-bold text-text-muted uppercase">Background</Text>

                <View className="flex-row items-center gap-2">
                  <Briefcase size={14} color="#64748b" />
                  <Text className="text-xs text-text">
                    Experience: {optionLabel(options.data?.experience_bands, selectedCandidate?.experience_band) || "Not specified"}
                  </Text>
                </View>

                {selectedCandidate?.qualification ? (
                  <View className="flex-row items-center gap-2">
                    <GraduationCap size={14} color="#64748b" />
                    <Text className="text-xs text-text">
                      Qualification: {optionLabel(options.data?.qualifications, selectedCandidate.qualification) || selectedCandidate.qualification}
                    </Text>
                  </View>
                ) : null}

                {selectedCandidate?.languages?.length ? (
                  <View className="flex-row items-center gap-2">
                    <Languages size={14} color="#64748b" />
                    <Text className="text-xs text-text">
                      Languages: {selectedCandidate.languages.join(", ")}
                    </Text>
                  </View>
                ) : null}

                {selectedCandidate?.area || selectedCandidate?.city ? (
                  <View className="flex-row items-center gap-2">
                    <MapPin size={14} color="#64748b" />
                    <Text className="text-xs text-text">
                      Location: {[selectedCandidate.area, selectedCandidate.city].filter(Boolean).join(", ")}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Action in Modal */}
              <View className="mt-2 border-t border-line pt-3">
                {selectedCandidate?.applied ? (
                  <Button
                    variant="secondary"
                    size="md"
                    className="w-full"
                    onPress={() => {
                      setSelectedCandidate(null);
                      onOpenApplications();
                    }}
                  >
                    View Application
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    className="w-full"
                    disabled={invited.has(selectedCandidate?.profile_id || "") || invite.isPending}
                    loading={invite.isPending}
                    onPress={() => {
                      if (selectedCandidate) {
                        invite.mutate(selectedCandidate.profile_id);
                      }
                    }}
                  >
                    {invited.has(selectedCandidate?.profile_id || "") ? "Already Invited" : "Invite Candidate to Apply"}
                  </Button>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
