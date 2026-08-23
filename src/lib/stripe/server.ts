import Stripe from "stripe";

// Server-only — this file must never be imported from a "use client"
// component (the secret key would end up in the browser bundle). It's only
// ever imported by the route handlers under src/app/api/stripe/.
//
// PAYMENTS / TEST -> LIVE: `STRIPE_SECRET_KEY` should hold a *test-mode*
// secret key (starts with `sk_test_`) during development. Swap it for a
// live key (`sk_live_`) in your Vercel project's production environment
// variables when you're ready to take real payments — nothing in the code
// needs to change, Stripe keys carry their own mode.
//
// The client is built lazily (on first use, not at module load) so a
// build/deploy without these env vars set yet doesn't fail outright —
// Next.js imports route modules while tracing the build, which would
// otherwise trip a top-level throw before a single request ever reads it.
let cachedStripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY. Copy .env.local.example to .env.local and add your Stripe test secret key."
    );
  }
  cachedStripe = new Stripe(secretKey);
  return cachedStripe;
}

// The prices this whole app charges, defined inline as `price_data` at
// Checkout Session creation time (see src/app/api/stripe/checkout/route.ts
// and checkout-pack/route.ts) rather than pre-created Stripe Price objects —
// that avoids needing any manual setup in the Stripe Dashboard beyond
// grabbing an API key.
export const SUBSCRIPTION_PRICE_USD_CENTS = 499;
// One-time price to unlock a single premium pack without subscribing.
export const PACK_PRICE_USD_CENTS = 100;
