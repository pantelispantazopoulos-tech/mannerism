"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "@/lib/supabase/types";
import { translations } from "./translations";

const LocaleContext = createContext<Locale>("en");

// Wraps the parts of the room page that render once a room (and therefore
// its language) is known. Everything outside a room — the landing page,
// /premium — has no locale context and stays in English.
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match
  );
}

export function useTranslation() {
  const locale = useContext(LocaleContext);
  const dict = translations[locale];

  const t = useMemo(
    () => (key: keyof typeof dict, vars?: Vars) => interpolate(dict[key] ?? key, vars),
    [dict]
  );

  return { locale, t };
}
