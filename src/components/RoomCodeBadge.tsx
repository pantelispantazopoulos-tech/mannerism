"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n/LocaleContext";

export function RoomCodeBadge({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  async function handleShare() {
    const url = `${window.location.origin}/room/${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: t("shareTitle"), url });
        return;
      } catch {
        // user cancelled share sheet — fall through to copy
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-sm font-bold uppercase tracking-widest text-parchment/60">{t("roomCode")}</span>
      <div className="rounded-3xl border-2 border-ink/10 bg-parchment px-8 py-5 shadow-note">
        <span className="font-display text-5xl font-bold tracking-[0.2em] text-ink">{code}</span>
      </div>
      <button
        onClick={handleShare}
        className="rounded-full bg-parchment px-5 py-2 text-sm font-bold text-ink/70 shadow-note-sm active:translate-y-0.5 active:shadow-none"
      >
        {copied ? t("linkCopied") : t("shareJoinLink")}
      </button>
    </div>
  );
}
