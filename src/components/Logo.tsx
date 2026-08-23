import Image from "next/image";

// The one brand mark, used everywhere a logo appears (landing page, the
// in-room header). Source assets live in public/branding/ at three sizes:
//   - mannerism-logo-1024.png — master source. Not referenced by the app
//     directly; this is what future icon/asset regeneration (including, if
//     a Capacitor Android build is ever added, generating the adaptive
//     icon mipmap set — mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi — under
//     android/app/src/main/res/mipmap-*/ via `npx capacitor-assets
//     generate` or Android Studio's Image Asset tool) should start from.
//   - mannerism-logo-512.png — Play Store listing icon / manifest.json's
//     512 entry.
//   - mannerism-logo-192.png — favicon (see layout.tsx) and manifest.json's
//     192 entry; also what this component renders in-app, since on-screen
//     usage never needs more than a couple hundred px.
export function Logo({ size = 64, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/branding/mannerism-logo-192.png"
      alt="Mannerism"
      width={192}
      height={192}
      priority
      className={`rounded-2xl ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
