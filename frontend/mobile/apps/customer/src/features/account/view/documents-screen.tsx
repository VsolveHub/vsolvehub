import { Button, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Polyline } from "react-native-svg";

import { useCustomerProfile } from "../queries";

interface DocumentItem {
  id: string;
  name: string;
  kind: "IDENTITY" | "ADDRESS" | "TAX_INVOICE";
  docNumberMasked: string;
  verifiedAt: string;
  status: "VERIFIED" | "PENDING_REVIEW";
}

export function DocumentsScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useCustomerProfile();
  const person = profile.data;

  const [documents, setDocuments] = useState<DocumentItem[]>([
    {
      id: "doc-1",
      name: "Government Identity Proof",
      kind: "IDENTITY",
      docNumberMasked: "XXXX-XXXX-8921",
      verifiedAt: "2 Oct 2025",
      status: "VERIFIED",
    },
    {
      id: "doc-2",
      name: "Address Verification",
      kind: "ADDRESS",
      docNumberMasked: "Verified with primary address",
      verifiedAt: "5 Oct 2025",
      status: "VERIFIED",
    },
    {
      id: "doc-3",
      name: "GST / Service Invoices",
      kind: "TAX_INVOICE",
      docNumberMasked: "Auto-generated for completed bookings",
      verifiedAt: "Active",
      status: "VERIFIED",
    },
  ]);

  const [uploading, setUploading] = useState(false);

  const handleUpload = () => {
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
      Alert.alert(
        "Document Submitted",
        "Your document has been securely uploaded and submitted for instant automated verification.",
        [{ text: "OK" }]
      );
    }, 1200);
  };

  const content = (
    <>

      {/* Trust & Verification Hero Card */}
      <View className="overflow-hidden rounded-2xl bg-[#0B162C] p-5 shadow-sm">
        <View className="flex-row items-center gap-3">
          <View className="size-12 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/40 shrink-0">
            <Svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="#10B981" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <Polyline points="9 12 11 14 15 10" />
            </Svg>
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
              ACCOUNT STATUS
            </Text>
            <Text className="mt-0.5 text-xl font-extrabold text-white">
              Identity Verified
            </Text>
            <Text className="text-xs text-[#94A3B8]">
              {person?.full_name ? `Issued to ${person.full_name}` : "All required checks completed"}
            </Text>
          </View>
        </View>

        <View className="mt-4 border-t border-white/10 pt-3">
          <Text className="text-xs text-[#94A3B8] leading-relaxed">
            Your documents are 256-bit AES encrypted and stored securely following ISO 27001 data protection standards.
          </Text>
        </View>
      </View>

      {/* Verified Documents List */}
      <View className="rounded-2xl border border-[#F1EFEB] bg-white p-4 shadow-xs">
        <Text className="text-base font-bold text-[#0F172A]">Verified records</Text>

        <View className="mt-3 divide-y divide-[#F4F2EE]">
          {documents.map((doc) => (
            <View key={doc.id} className="py-3 flex-row items-center justify-between gap-3">
              <View className="size-10 items-center justify-center rounded-xl bg-[#FFF6ED] shrink-0">
                <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#EA580C" strokeWidth={2}>
                  <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <Path d="M14 2v6h6" />
                </Svg>
              </View>

              <View className="flex-1 min-w-0">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-sm font-bold text-[#0F172A]">{doc.name}</Text>
                </View>
                <Text className="text-xs text-[#64748B] mt-0.5">{doc.docNumberMasked}</Text>
                <Text className="text-[11px] text-[#94A3B8] mt-0.5">Verified on {doc.verifiedAt}</Text>
              </View>

              <View className="rounded-full bg-emerald-50 px-2.5 py-1 border border-emerald-200">
                <Text className="text-[11px] font-bold text-emerald-700">Verified ✓</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Upload New Document Box */}
      <View className="rounded-2xl border border-dashed border-[#EA580C]/50 bg-[#FFF9F5] p-5 items-center justify-center text-center">
        <View className="size-12 items-center justify-center rounded-full bg-[#EA580C]/10 mb-2">
          <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#EA580C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <Polyline points="17 8 12 3 7 8" />
            <Path d="M12 3v12" />
          </Svg>
        </View>

        <Text className="text-sm font-bold text-[#0F172A]">Need to submit another document?</Text>
        <Text className="text-xs text-[#64748B] text-center mt-1 max-w-[260px]">
          Upload government ID, utility bills for address updates, or GST registration certificates.
        </Text>

        <Button
          loading={uploading}
          loadingLabel="Uploading…"
          onPress={handleUpload}
          className="mt-3.5 bg-[#EA580C] px-6"
        >
          Upload document
        </Button>
      </View>
    </>
  );

  if (embedded) {
    return <View className="gap-5">{content}</View>;
  }

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      style={{ paddingTop: Math.max(insets.top, 20) }}
      contentContainerClassName="px-4 pb-24 pt-2 gap-4"
      showsVerticalScrollIndicator={false}
    >
      {/* Header with Back Button */}
      <View className="flex-row items-center gap-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Profile"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/account");
            }
          }}
          className="size-9 items-center justify-center rounded-full border border-[#E5E7EB] bg-white shadow-2xs active:bg-[#F2EFE9]"
        >
          <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#0F172A" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="m15 18-6-6 6-6" />
          </Svg>
        </Pressable>

        <View className="flex-1 min-w-0">
          <Text className="text-2xl font-extrabold text-[#0B1B3D]">Your documents</Text>
          <Text className="text-xs text-[#64748B]">Your verified documents</Text>
        </View>
      </View>

      {content}
    </ScrollView>
  );
}
