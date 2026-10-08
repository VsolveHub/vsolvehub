import { Button, Dialog, Input, Text } from "@vsolve/mobile-ui";
import { useEffect, useState } from "react";
import { ScrollView, View, Alert, Pressable } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { PartnerListing } from "../model";
import {
  createPartnerListing,
  updatePartnerListing,
} from "../queries";

const EMPLOYMENT_TYPES = ["Full Time", "Part Time", "Contract", "Internship"];
const WORK_MODES = ["Onsite", "Remote", "Hybrid"];

export function PostListingSheet({
  open,
  onOpenChange,
  editingListing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingListing?: PartnerListing | null;
}) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [employmentType, setEmploymentType] = useState("Full Time");
  const [workMode, setWorkMode] = useState("Onsite");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [location, setLocation] = useState("");
  const [experience, setExperience] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (editingListing) {
      setTitle(editingListing.title || "");
      setEmploymentType(editingListing.employment_type || "Full Time");
      setWorkMode(editingListing.work_mode || "Onsite");
      setSalaryMin(
        editingListing.salary_min_paise
          ? String(Math.round(editingListing.salary_min_paise / 100))
          : "",
      );
      setSalaryMax(
        editingListing.salary_max_paise
          ? String(Math.round(editingListing.salary_max_paise / 100))
          : "",
      );
      setLocation(editingListing.location || "");
      setExperience(editingListing.experience || "");
      setDescription(editingListing.description || "");
    } else {
      setTitle("");
      setEmploymentType("Full Time");
      setWorkMode("Onsite");
      setSalaryMin("");
      setSalaryMax("");
      setLocation("");
      setExperience("");
      setDescription("");
    }
  }, [editingListing, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const minPaise = salaryMin ? Math.round(Number(salaryMin) * 100) : undefined;
      const maxPaise = salaryMax ? Math.round(Number(salaryMax) * 100) : undefined;

      if (editingListing) {
        return updatePartnerListing(editingListing.id, {
          title,
          employment_type: employmentType,
          work_mode: workMode,
          salary_min_paise: minPaise,
          salary_max_paise: maxPaise,
          location,
          experience,
          description,
        });
      }

      return createPartnerListing({
        title,
        employment_type: employmentType,
        work_mode: workMode,
        salary_min_paise: minPaise,
        salary_max_paise: maxPaise,
        location,
        experience,
        description,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["partner-listings"] });
      onOpenChange(false);
      Alert.alert(
        "Success",
        editingListing ? "Job posting updated." : "Job opening posted successfully.",
      );
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message || "Failed to post job.");
    },
  });

  const handleSubmit = () => {
    if (!title.trim()) {
      Alert.alert("Required", "Please enter the role title.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingListing ? "Edit Job Posting" : "Post a Job Opening"}
      description="Publish an opening to find qualified workers, technicians, or staff."
    >
      <ScrollView className="max-h-[75vh]" showsVerticalScrollIndicator={false}>
        <View className="flex-col gap-4 py-2">
          <View>
            <Text className="text-xs font-semibold text-text">Job / Role Title *</Text>
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Senior Electrician / Plumber"
              className="mt-1.5"
            />
          </View>

          <View>
            <Text className="text-xs font-semibold text-text">Employment Type</Text>
            <View className="mt-1.5 flex-row flex-wrap gap-2">
              {EMPLOYMENT_TYPES.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setEmploymentType(type)}
                  className={`rounded-lg px-3 py-1.5 border ${
                    employmentType === type
                      ? "bg-[#f87000] border-[#f87000]"
                      : "bg-surface border-line"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      employmentType === type ? "text-white" : "text-text"
                    }`}
                  >
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View>
            <Text className="text-xs font-semibold text-text">Work Mode</Text>
            <View className="mt-1.5 flex-row flex-wrap gap-2">
              {WORK_MODES.map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => setWorkMode(mode)}
                  className={`rounded-lg px-3 py-1.5 border ${
                    workMode === mode
                      ? "bg-[#f87000] border-[#f87000]"
                      : "bg-surface border-line"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      workMode === mode ? "text-white" : "text-text"
                    }`}
                  >
                    {mode}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-text">Min Salary / mo (₹)</Text>
              <Input
                value={salaryMin}
                onChangeText={setSalaryMin}
                placeholder="e.g. 25000"
                keyboardType="numeric"
                className="mt-1.5"
              />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold text-text">Max Salary / mo (₹)</Text>
              <Input
                value={salaryMax}
                onChangeText={setSalaryMax}
                placeholder="e.g. 35000"
                keyboardType="numeric"
                className="mt-1.5"
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-text">Job Location</Text>
              <Input
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. Bengaluru, Karnataka"
                className="mt-1.5"
              />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold text-text">Experience</Text>
              <Input
                value={experience}
                onChangeText={setExperience}
                placeholder="e.g. 2+ years"
                className="mt-1.5"
              />
            </View>
          </View>

          <View>
            <Text className="text-xs font-semibold text-text">Job Description & Responsibilities</Text>
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder="Outline role responsibilities, key skills required, and perks..."
              multiline
              numberOfLines={4}
              className="mt-1.5 min-h-[6rem] py-2"
            />
          </View>

          <Button
            variant="primary"
            onPress={handleSubmit}
            disabled={mutation.isPending}
            className="mt-2"
          >
            <Text className="font-bold text-white">
              {mutation.isPending
                ? "Saving..."
                : editingListing
                  ? "Update Job"
                  : "Post Job Opening"}
            </Text>
          </Button>
        </View>
      </ScrollView>
    </Dialog>
  );
}
