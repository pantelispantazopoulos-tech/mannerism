// One-off script: builds proper Android adaptive-icon source layers
// (assets/icon-foreground.png, assets/icon-background.png) from
// public/branding/mannerism-logo-1024.png, which @capacitor/assets then
// reads in Custom Mode (see the PR description / README note). A flat,
// already-opaque logo can't be used directly as an adaptive icon
// foreground — Android masks it to a circle/squircle/rounded-square
// depending on the OEM launcher, cropping anything outside the ~66%
// "safe zone" of the 108dp canvas — so this shrinks the whole logo to
// fit that zone, centered on a background layer filled with the same
// coral sampled from the logo's own corner pixels. Both layers being the
// same color makes the seam invisible regardless of which mask shape a
// given launcher applies. Not part of the app build — rerun with
// `node scripts/gen-icon-layers.mjs` whenever the master logo changes.
import sharp from "sharp";

const CANVAS = 1024;
// ~66% of the canvas, matching Android's adaptive-icon safe-zone
// guidance (the center 66dp of a 108dp full-bleed layer).
const SAFE_ZONE = Math.round(CANVAS * 0.66);

const { data: cornerPixel } = await sharp("public/branding/mannerism-logo-1024.png")
  .extract({ left: CANVAS / 2, top: 10, width: 1, height: 1 })
  .raw()
  .toBuffer({ resolveWithObject: true });
const backgroundColor = { r: cornerPixel[0], g: cornerPixel[1], b: cornerPixel[2] };

await sharp({
  create: { width: CANVAS, height: CANVAS, channels: 3, background: backgroundColor },
})
  .png()
  .toFile("assets/icon-background.png");

const shrunkLogo = await sharp("public/branding/mannerism-logo-1024.png")
  .resize(SAFE_ZONE, SAFE_ZONE)
  .toBuffer();

await sharp({
  create: { width: CANVAS, height: CANVAS, channels: 3, background: backgroundColor },
})
  .composite([{ input: shrunkLogo, gravity: "center" }])
  .png()
  .toFile("assets/icon-foreground.png");

console.log(
  "wrote assets/icon-background.png and assets/icon-foreground.png, background",
  `rgb(${backgroundColor.r},${backgroundColor.g},${backgroundColor.b})`
);
