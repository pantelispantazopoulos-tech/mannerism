import Link from "next/link";
import { Screen, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/Button";

// Not localized (same reasoning as /premium and /privacy) — English only
// for now.
//
// TODO (you, before Play Store submission): same caveat as /privacy —
// this is a structural starting point, not final legal copy. Have it
// reviewed before launch.
export default function TermsPage() {
  return (
    <Screen>
      <ScreenTitle>Terms of Service</ScreenTitle>
      <div className="flex w-full flex-col gap-5 text-sm text-parchment/80">
        <p className="text-parchment/60">
          Last updated: TODO — set this date when the real terms ship. This page is a starting
          structure, not final legal wording.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-parchment">The game</h2>
          <p>
            Mannerism is a party game played in person — the app coordinates rounds and scores;
            you and your group act it out. Rooms and the people in them are only as well-behaved
            as your own group; there&apos;s no way for us to moderate what happens in the room
            itself.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-parchment">Content packs &amp; age rating</h2>
          <p>
            Some premium packs contain mature themes (see the Flirty &amp; Cheeky pack&apos;s
            in-app consent prompt before it&apos;s used in a room). By using packs like this you
            confirm everyone in your room is comfortable with that content.
          </p>
          <p className="rounded-2xl border-2 border-coral/40 bg-coral/10 p-3 text-xs font-semibold text-coral">
            TODO: state a minimum age appropriate to the app&apos;s actual content rating once
            you&apos;ve completed Play Console&apos;s content rating questionnaire (see the code
            comment near the Flirty &amp; Cheeky pack in supabase/schema.sql) — the age stated
            here must match that rating, not be picked independently.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-parchment">Subscriptions &amp; purchases</h2>
          <p>
            Mannerism Premium ($4.99/month) and individual pack unlocks ($1 one-time) are billed
            by Stripe, not through Google Play — see <Link href="/privacy" className="underline">Privacy</Link>{" "}
            for how billing data is handled.
          </p>
          <p className="rounded-2xl border-2 border-coral/40 bg-coral/10 p-3 text-xs font-semibold text-coral">
            TODO: standard boilerplate still needed here — cancellation/refund policy, what
            happens to a subscription if the app is removed from Play, dispute process.
          </p>
        </section>

        <p className="rounded-2xl border-2 border-ink/10 bg-parchment/5 p-3 text-xs font-medium text-parchment/50">
          TODO: liability disclaimer, governing law/jurisdiction, and a contact method for
          disputes — a lawyer should fill these in, not a placeholder.
        </p>
      </div>
      <Link href="/">
        <Button variant="ghost">Back home</Button>
      </Link>
    </Screen>
  );
}
