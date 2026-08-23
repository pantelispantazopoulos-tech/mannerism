import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import { CapacitorBackButton } from "@/components/CapacitorBackButton";
import { OfflineScreen } from "@/components/OfflineScreen";
import "./globals.css";

// The shared type pairing: a characterful condensed display face for
// headlines/room codes/pattern text, and a highly legible neutral body face
// for everything else. Exposed as CSS variables and consumed via
// tailwind.config.ts's fontFamily.display / fontFamily.sans — components
// never import these directly.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mannerism",
  description: "A live party game of secret mannerisms — inspired by Psychiatrist / Psych Ward.",
  // The 192px branding asset doubles as the favicon — see the size
  // breakdown in src/components/Logo.tsx for what each exported size is
  // for. manifest.json's own icons list separately references 192/512.
  icons: {
    icon: "/branding/mannerism-logo-192.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1B1830",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="bg-ink text-parchment">
        {/* Brand background pattern (public/patterns/mannerism-pattern.svg),
            behind every screen — see the .brand-pattern-bg rule in
            globals.css for the styling and why it's a real element (not
            body's own background-image or a ::before) at z-index: 0 rather
            than the page content sitting at the default z-index with the
            pattern pushed to a negative one. */}
        <div className="brand-pattern-bg" aria-hidden="true" />
        <div className="relative z-[1]">{children}</div>
        {/* Both are no-ops in the regular web app — see their own file
            comments. Rendered once here, same as the background pattern
            above, rather than per-screen. */}
        <CapacitorBackButton />
        <OfflineScreen />
      </body>
    </html>
  );
}
