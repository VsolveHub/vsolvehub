import { Badge, Button, Card, Text, cn } from "@vsolve/mobile-ui";
import { Alert, Linking, View } from "react-native";
import { Check, ExternalLink, Mail, Phone, User, Eye } from "lucide-react-native";

import {
  type PartnerApplication,
  getApplicantStatusBadge,
} from "../model";

export function ApplicantCard({
  application,
  onUpdateStatus,
  onRevealContact,
}: {
  application: PartnerApplication;
  onUpdateStatus: (application: PartnerApplication, newStatus: string) => void;
  onRevealContact: (application: PartnerApplication) => void;
}) {
  const badge = getApplicantStatusBadge(application.status);
  const status = (application.status ?? "").toUpperCase();

  const handleCall = () => {
    if (application.candidate_phone) {
      void Linking.openURL(`tel:${application.candidate_phone}`);
    } else {
      Alert.alert("Contact Hidden", "Please reveal candidate contact first.");
    }
  };

  const handleEmail = () => {
    if (application.candidate_email) {
      void Linking.openURL(`mailto:${application.candidate_email}`);
    } else {
      Alert.alert("Contact Hidden", "Please reveal candidate contact first.");
    }
  };

  const handleOpenResume = () => {
    if (application.resume_url) {
      void Linking.openURL(application.resume_url);
    }
  };

  return (
    <Card className="border border-line bg-surface p-4 shadow-sm">
      <View className="flex-row items-center justify-between border-b border-line/60 pb-3">
        <View className="flex-row items-center gap-2">
          <User size={16} color="#071328" />
          <Text className="text-base font-bold text-text">
            {application.candidate_name || "Applicant"}
          </Text>
        </View>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </View>

      <View className="mt-3 flex-col gap-2">
        {application.experience ? (
          <Text className="text-xs text-text-muted">
            Experience: <Text className="font-semibold text-text">{application.experience}</Text>
          </Text>
        ) : null}

        {application.skills && application.skills.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5 pt-1">
            {application.skills.map((skill, i) => (
              <View key={i} className="rounded-md bg-surface-muted px-2 py-0.5">
                <Text className="text-[11px] font-medium text-text-muted">{skill}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {application.cover_note ? (
          <View className="mt-1 rounded-lg bg-surface-muted p-2.5">
            <Text className="text-xs text-text-muted" numberOfLines={3}>
              "{application.cover_note}"
            </Text>
          </View>
        ) : null}
      </View>

      {/* Candidate Contact & Resume Actions */}
      <View className="mt-3.5 flex-row flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
        <View className="flex-row items-center gap-2">
          {application.resume_url ? (
            <Button
              variant="secondary"
              size="sm"
              onPress={handleOpenResume}
              className="h-8 flex-row items-center gap-1 px-2.5"
            >
              <ExternalLink size={12} color="#071328" />
              <Text className="text-xs font-semibold text-text">Resume</Text>
            </Button>
          ) : null}

          {application.candidate_phone ? (
            <Button
              variant="secondary"
              size="sm"
              onPress={handleCall}
              className="h-8 flex-row items-center gap-1 px-2.5"
            >
              <Phone size={12} color="#f87000" />
              <Text className="text-xs font-semibold text-[#f87000]">Call</Text>
            </Button>
          ) : null}

          {application.candidate_email ? (
            <Button
              variant="secondary"
              size="sm"
              onPress={handleEmail}
              className="h-8 flex-row items-center gap-1 px-2.5"
            >
              <Mail size={12} color="#071328" />
              <Text className="text-xs font-semibold text-text">Email</Text>
            </Button>
          ) : null}

          {!application.candidate_phone && !application.candidate_email ? (
            <Button
              variant="secondary"
              size="sm"
              onPress={() => onRevealContact(application)}
              className="h-8 flex-row items-center gap-1 px-2.5"
            >
              <Eye size={12} color="#f87000" />
              <Text className="text-xs font-semibold text-[#f87000]">Reveal Phone</Text>
            </Button>
          ) : null}
        </View>
      </View>

      {/* Pipeline Status Stepper */}
      <View className="mt-3 flex-row flex-wrap gap-1.5 border-t border-line/40 pt-2.5">
        <Button
          variant={status === "UNDER_REVIEW" ? "primary" : "ghost"}
          size="sm"
          onPress={() => onUpdateStatus(application, "UNDER_REVIEW")}
          className="h-7 px-2"
        >
          <Text className={cn("text-[11px]", status === "UNDER_REVIEW" ? "text-white font-bold" : "text-text-muted")}>
            Review
          </Text>
        </Button>

        <Button
          variant={status === "SHORTLISTED" ? "primary" : "ghost"}
          size="sm"
          onPress={() => onUpdateStatus(application, "SHORTLISTED")}
          className="h-7 px-2"
        >
          <Text className={cn("text-[11px]", status === "SHORTLISTED" ? "text-white font-bold" : "text-text-muted")}>
            Shortlist
          </Text>
        </Button>

        <Button
          variant={status === "CONTACTED" ? "primary" : "ghost"}
          size="sm"
          onPress={() => onUpdateStatus(application, "CONTACTED")}
          className="h-7 px-2"
        >
          <Text className={cn("text-[11px]", status === "CONTACTED" ? "text-white font-bold" : "text-text-muted")}>
            Contacted
          </Text>
        </Button>

        <Button
          variant={status === "REJECTED" ? "danger" : "ghost"}
          size="sm"
          onPress={() => onUpdateStatus(application, "REJECTED")}
          className="h-7 px-2"
        >
          <Text className={cn("text-[11px]", status === "REJECTED" ? "text-white font-bold" : "text-rose-600")}>
            Reject
          </Text>
        </Button>
      </View>
    </Card>
  );
}
