import type { Config } from "tailwindcss";

// Shared theme layer — "secret note passed at the table." Exactly four
// brand colors (plus standard grayscale) and one shared set of animation
// primitives, reused by every screen instead of each component inventing
// its own one-off styles. See src/app/globals.css for the CSS custom
// properties these map to, and prefers-reduced-motion handling.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#1B1830",
          light: "#2B2748", // one step up, for subtle ink-on-ink separation (e.g. borders on the ink background)
        },
        parchment: {
          DEFAULT: "#F2E9D8",
          dim: "#E6D9C0", // slightly deeper parchment for nested/alternate surfaces
        },
        coral: {
          DEFAULT: "#FF5D5D",
          dark: "#E14545", // pressed/hover state of the same accent, not a new hue
        },
        sage: {
          DEFAULT: "#8FA998",
          dark: "#6E8778",
        },
      },
      fontFamily: {
        // Condensed, characterful display face for headlines/room codes/pattern text.
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        // Neutral, highly legible body face for everything else.
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // A soft "lifted paper" elevation shadow — works the same whether
        // it's a parchment card or a solid coral/ink/sage button sitting on
        // the dark ink page, unlike a hard color-matched offset shadow
        // (which disappears when button-color === page-color).
        note: "0 10px 30px -6px rgba(0, 0, 0, 0.45)",
        "note-sm": "0 6px 16px -4px rgba(0, 0, 0, 0.4)",
        "glow-coral": "0 0 0 0 rgba(255, 93, 93, 0.0), 0 0 22px 2px rgba(255, 93, 93, 0.18)",
      },
      keyframes: {
        // 1. Room code digit entry — flip-clock style.
        "flip-in": {
          "0%": { transform: "rotateX(-100deg)", opacity: "0" },
          "60%": { transform: "rotateX(12deg)", opacity: "1" },
          "100%": { transform: "rotateX(0deg)", opacity: "1" },
        },
        // 2. Waiting-room avatars, low-amplitude bob.
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        // 3. Secret pattern reveal — un-blur + slide out like peeking at a note.
        "reveal-note": {
          "0%": { opacity: "0", filter: "blur(10px)", transform: "translateY(10px) scale(0.97)" },
          "100%": { opacity: "1", filter: "blur(0)", transform: "translateY(0) scale(1)" },
        },
        // 4. Guesser's screen — slow breathing glow while on the spot.
        "breathing-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255,93,93,0), 0 0 20px 2px rgba(255,93,93,0.14)" },
          "50%": { boxShadow: "0 0 0 0 rgba(255,93,93,0), 0 0 38px 8px rgba(255,93,93,0.32)" },
        },
        // 5. Correct guess — coral confetti particle fall/spin.
        "confetti-fall": {
          "0%": { transform: "translate(0, 0) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translate(var(--confetti-x, 0), 140px) rotate(var(--confetti-r, 200deg))", opacity: "0" },
        },
        // 6. Incorrect guess — gentle, playful wobble (never harsh/red).
        wobble: {
          "0%": { transform: "rotate(0deg)" },
          "20%": { transform: "rotate(-2.5deg)" },
          "40%": { transform: "rotate(2deg)" },
          "60%": { transform: "rotate(-1.25deg)" },
          "80%": { transform: "rotate(0.75deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
        // 7. Next guesser rotation — spotlight sweep landing on each avatar in turn.
        "spotlight-sweep": {
          "0%": { boxShadow: "0 0 0 0 rgba(255,93,93,0)", transform: "scale(1)" },
          "40%": { boxShadow: "0 0 0 5px rgba(255,93,93,0.55)", transform: "scale(1.08)" },
          "100%": { boxShadow: "0 0 0 0 rgba(255,93,93,0)", transform: "scale(1)" },
        },
      },
      animation: {
        "flip-in": "flip-in 0.32s cubic-bezier(0.2, 0.8, 0.3, 1) both",
        "bob-slow": "bob 2.6s ease-in-out infinite",
        "reveal-note": "reveal-note 0.4s ease-out both",
        "breathing-glow": "breathing-glow 2.8s ease-in-out infinite",
        "confetti-fall": "confetti-fall 0.9s ease-in both",
        wobble: "wobble 0.5s ease-in-out both",
        "spotlight-sweep": "spotlight-sweep 0.45s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
