# Mannerism

[![CI](https://github.com/pantelispantazopoulos-tech/mannerism/actions/workflows/ci.yml/badge.svg)](https://github.com/pantelispantazopoulos-tech/mannerism/actions/workflows/ci.yml)

A live party game inspired by the classic "Psychiatrist" / "Psych Ward" parlor
game. One player is the Guesser and asks the group questions out loud; every
other player is secretly given the same mannerism to act out while
answering (e.g. *"touch your ear before every answer"*). The Guesser tries
to figure out the pattern.

Built as a mobile-first web app — no app install, players just open a link
on their phone.

**Stack:** Next.js (App Router) on Vercel's free tier, Supabase free tier
for Postgres + Realtime + Auth, Stripe for the one paid tier (Mannerism
Premium, $4.99/month, test mode by default).

## How the game works

1. A host opens the app and creates a room, getting a short 5-character
   room code.
2. Other players open the app on their own phones and join with that code
   (no account, no install).
3. Once 2+ players have joined, the host starts a round. The app randomly
   picks a Guesser and a secret pattern from the pattern bank, and shows the
   pattern to everyone *except* the Guesser.
4. The Guesser asks questions out loud, in person, while a shared countdown
   runs on every screen. Everyone else answers naturally while acting out
   their secret mannerism.
5. The Guesser types a guess into the app. The app reveals the actual
   pattern; the group decides out loud whether the guess was close enough,
   and the host taps Correct/Incorrect to score it.
6. The Guesser role rotates to someone new next round.

Any player can also write their own pattern for the room from **✏️ Create a
pattern** — free, no account, and it joins that room's pattern pool
immediately. Subscribers can additionally save a pattern to a private
library, publish it to a pool shared with other subscribers, and unlock the
three premium packs.

## Project structure

```
supabase/
  schema.sql   — tables, RLS policies, secure views, RPC functions
  seed.sql     — free Starter Pack (30 patterns) + 3 premium pack stubs
src/
  app/
    page.tsx                       — home: create / join room
    room/[code]/page.tsx           — lobby + live round flow
    room/[code]/patterns/page.tsx  — create/save/publish patterns, browse the shared pool
    premium/page.tsx               — pattern pack store, subscription-gated
    api/stripe/checkout/route.ts   — creates a Stripe Checkout Session (server-only)
    api/stripe/webhook/route.ts    — syncs subscription state from Stripe (server-only)
  components/              — shared UI (Button, PlayerList, PatternCard, UpgradePrompt, …)
  lib/
    supabase/              — browser client, hand-written DB types, anon-auth + account hooks
    game/                  — RPC wrappers (roomApi.ts, patternsApi.ts) + realtime hook
    stripe/                — server-only Stripe client + client-side checkout helper
    i18n/                  — the 7-language dictionary and locale context for in-room UI
```

## Data model

- **rooms** — code, host, status (`lobby` / `active` / `reveal` / `ended`),
  language, current round pointer, round timer length.
- **players** — linked to a room, a name, host flag, rotation tracking,
  score.
- **patterns** — the shared catalog: pattern text (translated into all 7
  languages), `pack_name`, `is_free` boolean (free starter pack vs. premium
  packs).
- **custom_patterns** — free, no-login, room-session-only patterns players
  write in from the Create Pattern screen. Cascades away with the room.
- **rounds** — which player is guessing, which pattern was picked (from
  either `patterns` or `custom_patterns` — exactly one is set), the guess
  text, and whether it was graded correct. Never exposed directly to
  clients — see below.
- **users** — one row per player who has linked an email (see "Accounts &
  subscriptions" below); subscription status and Stripe identifiers live
  here.
- **pattern_library** — a subscriber's private, reusable saved patterns.
- **public_patterns** — the pool subscribers publish into and browse from;
  reported patterns are hidden (`is_hidden`), never deleted.

## How the secret pattern stays secret

The Guesser's browser genuinely never receives the pattern text before the
reveal. `rounds` is deliberately **not** included in the Supabase Realtime
publication (only `rooms` and `players` are), and there is no RLS policy
granting direct `SELECT` on `rounds` at all. Instead, clients read a
`rounds_secure` Postgres view that masks `pattern_text`/`pattern_pack_name`
to `NULL` for whoever the current guesser is, based on `auth.uid()`
server-side. Realtime updates to `rooms` are just a signal to re-fetch that
view — the actual masking happens in Postgres, not in the client. See the
comments in `supabase/schema.sql` for the full reasoning.

All game-state writes (creating a room, joining, starting a round,
submitting a guess, grading a round) go through `SECURITY DEFINER` RPC
functions, never direct table writes, so the authorization checks (only the
host can start a round, only the guesser can submit a guess, etc.) are
enforced in the database, not just the UI.

## Accounts & subscriptions

Every device is signed in anonymously the moment the app loads — enough to
host/join rooms and add free custom patterns. Saving a pattern, publishing
it, browsing the shared pool, and premium packs all require **Mannerism
Premium** ($4.99/month, Stripe Checkout, test mode until you swap in live
keys — see `.env.local.example`).

- **Linking an account** doesn't create a new identity — a player clicks
  "Upgrade", enters an email, and `supabase.auth.updateUser({ email })`
  upgrades their *existing* anonymous session to a permanent one (Supabase's
  documented anonymous-to-permanent flow). `auth.uid()` never changes, so
  their room history stays attached to the same id; they just gain an
  email. Once they click the confirmation link, a row appears in
  `public.users` (via the `on_auth_user_upsert` trigger), which is what
  subscription state hangs off of.
- **Checkout** (`src/app/api/stripe/checkout/route.ts`) creates a Stripe
  Customer (if the user doesn't have one yet) and a Checkout Session for an
  inline `$4.99/month` price — no need to pre-create a Price object in the
  Stripe Dashboard.
- **The webhook** (`src/app/api/stripe/webhook/route.ts`) verifies Stripe's
  signature and updates `public.users.subscription_status` /
  `subscribed_until` on `checkout.session.completed`,
  `customer.subscription.updated`, and `customer.subscription.deleted`.
  It uses the Supabase **service role** key (`src/lib/supabase/admin.ts`)
  to write past RLS, since clients can only ever *read* their own
  subscription row.
- **Premium packs are gated by the ROOM HOST's subscription**, not each
  individual player's — whoever hosts a room brings their subscription to
  everyone playing in it, the direct replacement for the old
  `rooms.premium_unlocked` flag. See `is_subscribed()` and the combined
  pattern pool in `start_round` in `supabase/schema.sql`.
- **Saving to a library, publishing to the shared pool, and browsing that
  pool** are gated by the *acting* player's own subscription (checked in
  the `save_pattern_to_library` / `publish_pattern_to_pool` RPCs and the
  `public_patterns_select_subscribed` RLS policy).
- Wherever a free player hits one of these gates, `UpgradePrompt`
  (`src/components/UpgradePrompt.tsx`) explains what subscribing unlocks
  and walks them through linking an email + Checkout.
- **Reporting** a shared-pool pattern (`report_public_pattern`) sets
  `is_hidden = true` rather than deleting the row, so there's something to
  review — and isn't gated behind a subscription, since flagging bad
  content shouldn't require payment.

## Setup

### 1. Supabase project

1. Create a free project at [supabase.com](https://supabase.com).
2. In **Authentication → Sign In / Providers**, enable **Anonymous
   Sign-ins** (the app uses `supabase.auth.signInAnonymously()` so players
   never need to make an account) and make sure **Email** sign-in is on
   (it is by default) — that's what upgrades an anonymous session once a
   player links an email.
3. In **Authentication → URL Configuration**, set **Site URL** to wherever
   the app is deployed (e.g. your Vercel URL, or `http://localhost:3000`
   for local dev) and add it under **Redirect URLs** too — that's where
   Supabase sends players after they click an email confirmation link.
4. In the SQL editor, run `supabase/schema.sql`, then `supabase/seed.sql`.
5. In **Project Settings → API**, copy the Project URL, the `anon` public
   key, and the `service_role` key (Settings → API → Project API keys —
   keep this one secret, it's server-only).

### 2. Stripe (test mode)

1. Create a free [Stripe](https://stripe.com) account if you don't have
   one — no business details needed to use test mode.
2. Make sure **Test mode** is toggled on (top-right of the Dashboard), then
   go to **Developers → API keys** and copy the **Secret key**
   (`sk_test_...`).
3. Go to **Developers → Webhooks → Add endpoint**, pointing at
   `https://<your-deployed-domain>/api/stripe/webhook` (Stripe can't reach
   `localhost`; use the Stripe CLI's `stripe listen --forward-to
   localhost:3000/api/stripe/webhook` for local testing instead). Select
   the `checkout.session.completed`, `customer.subscription.updated`, and
   `customer.subscription.deleted` events. Copy the endpoint's **Signing
   secret** (`whsec_...`).

### 3. App

```bash
npm install
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
npm run dev
```

Open `http://localhost:3000` on your phone (or a few browser windows) to
try it with 2+ "players". Use one of
[Stripe's test cards](https://docs.stripe.com/testing#cards) (e.g.
`4242 4242 4242 4242`, any future expiry, any CVC) to complete a test
checkout.

### 4. Deploy

Push to a git repo and import it into [Vercel](https://vercel.com). Add all
five environment variables from `.env.local.example` in the Vercel project
settings, then point the Stripe webhook endpoint (step 2.3 above) at your
real deployed URL. When you're ready to take real payments, flip Stripe to
live mode, swap `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` for their live
equivalents in Vercel's production environment variables, and update the
Supabase Site URL/Redirect URLs to match — nothing else changes.

## Notes / things to revisit before a real launch

- Timer is purely visual and cosmetic (every phone counts down locally from
  the shared `round_started_at`); nothing force-ends a round when it hits
  zero, matching how the in-person game actually plays.
- Grading is self-reported by the host, like the original parlor game — the
  room decides out loud, the app just tallies it.
- The Create Pattern screen, account/upgrade UI, and shared pattern pool
  are English-only for now — unlike the core game screens (lobby, round
  play, reveal), they aren't wrapped in the room's `LocaleProvider`. Worth
  translating into the other 6 languages once the feature settles.
- No rate limiting on `create_custom_pattern` / anonymous sign-ups yet —
  fine for a party game among friends, worth adding (e.g. Supabase's
  built-in captcha/rate-limit settings) before a public launch.
