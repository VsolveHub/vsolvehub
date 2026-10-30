import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Text } from "@vsolve/mobile-ui";

export type AccountSectionKey =
  | "profile"
  | "wallet"
  | "coins"
  | "referrals"
  | "addresses"
  | "messages"
  | "documents"
  | "privacy"
  | "devices";

interface AccountSectionItem {
  key: AccountSectionKey;
  href: string;
  label: string;
  hint: string;
}

export const ACCOUNT_SECTIONS: readonly AccountSectionItem[] = [
  { key: "profile", href: "/account", label: "Profile", hint: "Your personal details" },
  { key: "wallet", href: "/account/wallet", label: "Wallet", hint: "Prepaid balance & top-ups" },
  { key: "coins", href: "/account/coins", label: "V Coins", hint: "Earned, locked & expiring" },
  { key: "referrals", href: "/account/referrals", label: "Refer & Earn", hint: "Invite friends for rewards" },
  { key: "addresses", href: "/account/addresses", label: "Addresses", hint: "Where we send someone" },
  { key: "messages", href: "/account/messages", label: "Messages", hint: "What we send you" },
  { key: "documents", href: "/account/documents", label: "Your documents", hint: "Your verified documents" },
  { key: "privacy", href: "/account/privacy", label: "Privacy", hint: "Your data and consents" },
  { key: "devices", href: "/account/sessions", label: "Devices", hint: "Where you are signed in" },
];

export function DesktopAccountNav({
  activeKey,
  onSelectSection,
}: {
  activeKey: AccountSectionKey;
  onSelectSection?: (key: AccountSectionKey) => void;
}) {
  const router = useRouter();

  return (
    <View className="w-56 shrink-0">
      <View className="flex-col gap-0.5">
        {ACCOUNT_SECTIONS.map((section) => {
          const isCurrent = section.key === activeKey;
          return (
            <Pressable
              key={section.key}
              accessibilityRole="link"
              onPress={() => {
                if (onSelectSection) {
                  onSelectSection(section.key);
                } else if (!isCurrent) {
                  router.push(section.href as never);
                }
              }}
              className={`flex-col items-start px-4 py-3 ${
                isCurrent
                  ? "border-l-[3px] border-[#EA580C] bg-[#F6F4F0]"
                  : "border-l-[3px] border-transparent bg-transparent hover:bg-[#F6F4F0]"
              }`}
            >
              <Text
                className={`text-[0.95rem] ${
                  isCurrent ? "font-bold text-[#D85C3A]" : "font-semibold text-navy-900"
                }`}
              >
                {section.label}
              </Text>
              <Text className="mt-0.5 text-[0.75rem] text-text-secondary">
                {section.hint}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
