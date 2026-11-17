// Ported from frontend/apps/partner/features/application/view/account-menu.tsx (HelpSheet)
import { Button, Sheet, useT } from "@vsolve/mobile-ui";
import { Mail, MessageCircle, Phone } from "lucide-react-native";
import { View } from "react-native";

import {
  PARTNER_SUPPORT_EMAIL,
  PARTNER_SUPPORT_HOURS_KEY,
  PARTNER_SUPPORT_PHONE_DISPLAY,
  openSupportCall,
  openSupportEmail,
  openSupportWhatsApp,
} from "@/features/support/contact";

/**
 * "Need help?": the support desk over the application, as a bottom sheet, the same three ways to
 * reach it as the website. It opens in place, so the applicant keeps their page behind it.
 */
export function HelpSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const row = "items-start justify-start";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("apply.help.title")}
      description={t(PARTNER_SUPPORT_HOURS_KEY)}
    >
      <View className="flex-col gap-2">
        <Button
          variant="outline"
          block
          className={row}
          icon={<Phone size={17} color="#00112e" />}
          onPress={() => openSupportCall()}
        >
          {t("workspaces.support.call")} · {PARTNER_SUPPORT_PHONE_DISPLAY}
        </Button>
        <Button
          variant="outline"
          block
          className={row}
          icon={<MessageCircle size={17} color="#00112e" />}
          onPress={() => openSupportWhatsApp()}
        >
          WhatsApp
        </Button>
        <Button
          variant="outline"
          block
          className={row}
          icon={<Mail size={17} color="#00112e" />}
          onPress={() => openSupportEmail()}
        >
          {t("workspaces.support.email")} · {PARTNER_SUPPORT_EMAIL}
        </Button>
      </View>
    </Sheet>
  );
}
