// One-off script: composes assets/splash.png (the Custom Mode source
// @capacitor/assets reads — see assets/README in the PR) from
// public/branding/mannerism-logo-512.png centered on an ink navy
// (#1B1830) background, per the Android splash screen spec (2732x2732,
// logo within the safe zone so it isn't clipped on any device). Not part
// of the app build — run with `node scripts/gen-splash.mjs` whenever the
// logo changes, same convention as scripts/gen-seed.mjs.
import sharp from "sharp";

const SIZE = 2732;
const LOGO_SIZE = 900;

const logo = await sharp("public/branding/mannerism-logo-512.png").resize(LOGO_SIZE, LOGO_SIZE).toBuffer();

await sharp({
  create: { width: SIZE, height: SIZE, channels: 4, background: "#1B1830" },
})
  .composite([{ input: logo, gravity: "center" }])
  .png()
  .toFile("assets/splash.png");

console.log("wrote assets/splash.png");
