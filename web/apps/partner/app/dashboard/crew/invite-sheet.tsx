"use client";

import { useState } from "react";
import { X, Copy, Check, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@vsolve/ui";
import { QrCode } from "@/components/crew/qr-code";
import { regenerateInvite } from "./actions";

export type InviteTarget = {
  id: string;
  name: string;
  roleLabel: string;
  phone: string | null;
  inviteUrl: string;
  status: string;
};

export function InviteSheet({ member, onClose }: { member: InviteTarget; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const shareText = `Hi ${member.name}, you've been added to our VSolve crew as ${member.roleLabel}. Tap to join and clock in: ${member.inviteUrl}`;
  const waHref = member.phone
    ? `https://wa.me/91${member.phone}?text=${encodeURIComponent(shareText)}`
    : `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(member.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Invite ${member.name}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-lg font-bold text-ink-900">Invite {member.name}</p>
            <p className="text-sm text-gray-500">{member.roleLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-muted hover:text-ink-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface-muted py-5">
          <QrCode value={member.inviteUrl} size={188} />
          <p className="mt-1 max-w-[16rem] text-center text-sm text-gray-500">
            Ask {member.name.split(" ")[0]} to scan this with their phone camera
          </p>
        </div>

        <div className="mt-4 space-y-2.5">
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="block">
            <Button type="button" className="w-full bg-[#25D366] text-white hover:bg-[#1da851]">
              <MessageCircle className="h-4 w-4" /> Share on WhatsApp
            </Button>
          </a>
          <Button type="button" variant="outline" className="w-full" onClick={copyLink}>
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            {copied ? "Link copied" : "Copy invite link"}
          </Button>
          <form action={regenerateInvite}>
            <input type="hidden" name="memberId" value={member.id} />
            <Button type="submit" variant="ghost" size="sm" className="w-full text-gray-500">
              <RefreshCw className="h-3.5 w-3.5" /> Reset link (invalidate the old one)
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
