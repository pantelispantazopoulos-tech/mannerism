// Pack icons — one inline SVG per pack, all sharing the same visual
// language (a rounded-square ink badge, drawn in the app's four brand
// colors only) so they read as one consistent family wherever packs are
// listed. Each accepts a `size` prop and renders cleanly from a small
// list-row size (~32px) up to a larger pack-selection card size (~64px)
// since they're plain vector shapes on a fixed 240x240 viewBox.

interface IconProps {
  size?: number;
  className?: string;
}

// The free Starter Pack — a simple parchment star on the ink badge.
export function StarterPackIcon({ size = 64, className }: IconProps) {
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="220" height="220" rx="46" fill="#1B1830" />
      <polygon
        points="120,65 134.1,100.6 172.3,103.0 142.8,127.4 152.3,164.5 120,144 87.7,164.5 97.2,127.4 67.7,103.0 105.9,100.6"
        fill="#F2E9D8"
      />
    </svg>
  );
}

// Spicy Adult Pack — a coral flame with a small parchment highlight.
export function AdultPackIcon({ size = 64, className }: IconProps) {
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="220" height="220" rx="46" fill="#1B1830" />
      <path
        d="M120,58 C93,90 78,122 90,152 C97,170 114,182 132,178 C158,172 170,150 158,128 C153,138 143,144 137,136 C149,116 144,90 120,58 Z"
        fill="#FF5D5D"
      />
      <ellipse cx="112" cy="150" rx="10" ry="16" fill="#F2E9D8" opacity="0.85" />
    </svg>
  );
}

// Office & Coworkers Pack — a simple parchment briefcase with a coral latch.
export function OfficePackIcon({ size = 64, className }: IconProps) {
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="220" height="220" rx="46" fill="#1B1830" />
      <rect x="100" y="82" width="40" height="30" rx="10" fill="none" stroke="#F2E9D8" strokeWidth="10" />
      <rect x="58" y="108" width="124" height="86" rx="10" fill="#F2E9D8" />
      <line x1="58" y1="152" x2="182" y2="152" stroke="#1B1830" strokeWidth="4" />
      <rect x="112" y="142" width="16" height="16" rx="3" fill="#FF5D5D" />
    </svg>
  );
}

// Movies & Celebrities Pack — clapperboard, as specified.
export function HollywoodPackIcon({ size = 64, className }: IconProps) {
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="220" height="220" rx="46" fill="#1B1830" />
      <rect x="60" y="110" width="120" height="80" rx="8" fill="#F2E9D8" />
      <path d="M55,95 L185,95 L178,118 L48,118 Z" fill="#F2E9D8" />
      <path d="M55,95 L75,95 L82,118 L62,118 Z" fill="#FF5D5D" />
      <path d="M95,95 L115,95 L122,118 L102,118 Z" fill="#FF5D5D" />
      <path d="M135,95 L155,95 L162,118 L142,118 Z" fill="#FF5D5D" />
      <rect x="52" y="82" width="130" height="16" rx="4" fill="#F2E9D8" transform="rotate(-8 117 90)" />
      <circle cx="90" cy="150" r="7" fill="#1B1830" />
      <circle cx="150" cy="150" r="7" fill="#1B1830" />
      <line x1="70" y1="170" x2="170" y2="170" stroke="#1B1830" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// Fallback for any pack whose icon_key doesn't match a known icon yet —
// keeps the badge family consistent instead of rendering nothing.
function DefaultPackIcon({ size = 64, className }: IconProps) {
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="220" height="220" rx="46" fill="#1B1830" />
      <circle cx="120" cy="120" r="46" fill="#F2E9D8" />
    </svg>
  );
}

const ICONS_BY_KEY: Record<string, (props: IconProps) => React.JSX.Element> = {
  starter: StarterPackIcon,
  adult: AdultPackIcon,
  hollywood: HollywoodPackIcon,
  office: OfficePackIcon,
};

// The dispatcher components actually reach for — looks up a pack's
// icon_key (from the `packs` table via pattern_catalog) and renders the
// matching icon, falling back to a neutral badge for anything unrecognized.
export function PackIcon({ iconKey, size = 64, className }: { iconKey: string } & IconProps) {
  const Icon = ICONS_BY_KEY[iconKey] ?? DefaultPackIcon;
  return <Icon size={size} className={className} />;
}
