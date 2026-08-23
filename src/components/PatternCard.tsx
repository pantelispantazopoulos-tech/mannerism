"use client";

import { useTranslation } from "@/lib/i18n/LocaleContext";

// The secret-pattern reveal — styled like a note pulled from an envelope:
// a slightly tilted parchment card with a torn/perforated top edge, the
// text itself un-blurring and sliding into place on mount. Keyed by the
// pattern text at the call site so a fresh pattern (e.g. after a skip)
// replays the reveal instead of just swapping text silently.
export function PatternCard({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <div className="w-full -rotate-1 rounded-b-3xl rounded-t-md border-2 border-ink/10 bg-parchment p-6 pt-5 shadow-note">
      {/* Torn/perforated edge — a row of little "tear" notches above the fold line. */}
      <div
        aria-hidden="true"
        className="-mx-6 -mt-5 mb-4 h-3 bg-[repeating-linear-gradient(110deg,transparent,transparent_6px,rgba(27,24,48,0.12)_6px,rgba(27,24,48,0.12)_7px)]"
      />
      <p className="text-center text-xs font-bold uppercase tracking-widest text-ink/50">
        {t("secretMannerism")}
      </p>
      <p className="mt-3 animate-reveal-note text-center font-display text-4xl font-bold leading-snug text-ink">
        {text}
      </p>
    </div>
  );
}
