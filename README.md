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
capacitor.config.ts — Android app config (see "Android app" below)
android/             — generated native project (Capacitor)
assets/              — source images @capacitor/assets generates icons/splash from
www/                 — placeholder webDir Capacitor requires even in remote-URL mode
supabase/
  schema.sql   — tables, RLS policies, secure views, RPC functions
  seed.sql     — free Starter Pack (30 patterns) + 3 premium pack stubs
src/
  app/
    page.tsx                       — home: create / join room
    room/[code]/page.tsx           — lobby + live round flow
    room/[code]/patterns/page.tsx  — create/save/publish patterns, browse the shared pool
    premium/page.tsx               — pattern pack store, subscription-gated
    privacy/page.tsx, terms/page.tsx — compliance pages (TODO sections — not final legal copy)
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

## Android app (Capacitor)

The Android app is a thin native shell around the same deployed website —
it loads `server.url` from `capacitor.config.ts` in a WebView, so the
website stays the single source of truth for game logic, packs, and
billing. Nothing in `supabase/`, the Stripe routes, or the core game
screens changed to support this.

**What's wired up:**

- `capacitor.config.ts` — app name, app ID, and `server.url` pointing at
  the deployed site (see the two placeholders flagged in that file —
  **you must replace both** before a real build; see the manual steps
  below).
- `android/` — the generated native project (Capacitor + `@capacitor/app`
  + `@capacitor/browser` already wired in).
- **Icons/splash**: generated from `public/branding/mannerism-logo-*.png`
  via `@capacitor/assets` — see `assets/` (the source layers) and
  `scripts/gen-splash.mjs` / `scripts/gen-icon-layers.mjs` (how they were
  built). Rerun `npx capacitor-assets generate --android` after changing
  the master logo.
- **Hardware back button** (`src/components/CapacitorBackButton.tsx`) —
  navigates the app's own history via `@capacitor/app`'s `backButton`
  event instead of closing the app or leaving the WebView in a broken
  state. No-op on the web.
- **Offline screen** (`src/components/OfflineScreen.tsx`) — a full-screen
  overlay shown whenever `navigator.onLine` goes false, instead of a
  frozen/blank WebView. Works on web too (no Capacitor dependency).
- **Payments never open in the WebView** — every Stripe Checkout redirect
  (`src/lib/stripe/checkout.ts`) opens the system browser via
  `@capacitor/browser` when running natively (regular `window.location`
  redirect on the web, unchanged). Button copy switches to "Continue on
  mannerism.app" natively so it's clear checkout is leaving the app.
  There is no Google Play Billing integration — deliberately, since
  nothing here is an in-app digital good Play's billing rules would
  require it for.
- `capacitor.config.ts`'s `server.allowNavigation` is scoped to only the
  deployed app's own hostname, as a defense-in-depth backstop on top of
  the above — the WebView has nothing else to navigate to.
- `/privacy` and `/terms` — structural pages with explicit `TODO` sections
  for the real legal wording (see below).

### Manual steps (outside of code)

These can't be done from here — they need Android Studio, a Google Play
Console account, and decisions only you can make.

1. ~~Pick your real app ID~~ — done, using the free
   `io.github.<username>.<app>` convention (no domain purchase needed):
   `io.github.pantelispantazopoulostech.mannerism`. This is a real,
   permanent ID as-is, not a placeholder — but if you register a real
   domain before your first Play Store release, you can still swap it for
   something like `app.mannerism.android` (it **cannot** change after
   that first release).
2. ~~Point `DEPLOYED_APP_URL` at your real production domain~~ — for now
   this points at the linked Vercel project's URL
   (`https://omniroute-khaki.vercel.app`), which is deployed and current.
   Swap it for a real custom domain later if you get one; no urgency.
3. **Install [Android Studio](https://developer.android.com/studio)** if
   you don't have it — it bundles the Android SDK and an emulator, both
   required to build or run the app.
4. **Open the generated project**: `npx cap open android`, or open the
   `android/` folder directly in Android Studio.
5. **Run a test build on an emulator**: in Android Studio, create a
   virtual device (Device Manager → Create Device), then press ▶ Run.
   Confirm the app launches, loads the real site, the back button
   navigates instead of closing the app, and a subscribe/pack-unlock
   button opens Chrome Custom Tabs rather than staying in-app.
6. **Create a release keystore**: run `scripts/generate-release-keystore.sh`
   yourself, interactively (it prompts for the store/key passwords rather
   than taking them as arguments, so only you ever see them — see the
   script's own comments for why). Store the keystore file and its
   passwords somewhere safe outside this repo (a password manager, not a
   commit) — losing either means you can never update the app under the
   same listing again. `android/.gitignore` already excludes
   `*.keystore`/`*.jks`/`key.properties`.
7. **Build a signed release**: in Android Studio, Build → Generate Signed
   App Bundle, pointing at the keystore from step 6. Produces the `.aab`
   file Play Console needs (not an `.apk` — Play Store requires App
   Bundles for new apps).
8. **Set up the Google Play Console listing**: create the app, fill in
   the store listing (description, screenshots — take these from the
   emulator or a real device), and upload the `.aab` from step 7.
9. **Complete the Data Safety form** in Play Console — this is where you
   formally declare what data the app collects (see `/privacy`'s TODOs,
   which are written to line up with this form: email for auth, gameplay
   data in Supabase, billing handled by Stripe). The declared answers and
   `/privacy`'s actual wording need to match.
10. **Complete the content rating questionnaire** in Play Console —
    answer honestly based on the Flirty & Cheeky pack's actual content
    (see the code comment on the pack definition in
    `supabase/schema.sql`). This will likely land the app at a Teen
    rating rather than Everyone; that's expected, not a problem to
    engineer around.
11. **Have `/privacy` and `/terms` reviewed** before submitting — both are
    structural starting points with explicit TODOs, not final legal
    copy.

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
- `@capacitor/assets` (a devDependency, used only to generate the Android
  icon/splash images — never shipped in the app itself) pulls in an old,
  vulnerable nested copy of `@capacitor/cli` for its unused iOS/Xcode asset
  path. `npm audit` will flag this; it's dev-tooling-only exposure, not
  worth `npm audit fix --force`'s breaking-change risk for a tool you run
  once per logo change.
