import { ReactNode } from "react";

// One job per screen, mobile-first, centered single column — the shared
// shell every route renders into. The page background (ink navy) comes
// from <body> in layout.tsx; this just constrains width and spacing.
export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-start gap-6 px-5 pb-12 pt-8">
      {children}
    </main>
  );
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-center font-display text-4xl font-bold leading-tight tracking-tight text-parchment">
      {children}
    </h1>
  );
}
