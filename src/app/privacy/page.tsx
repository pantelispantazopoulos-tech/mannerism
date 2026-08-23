import Link from "next/link";
import { Screen, ScreenTitle } from "@/components/Screen";
import { Button } from "@/components/Button";

// Not localized (same reasoning as /premium) — this is account/legal
// copy, not core gameplay. English only for now.
//
// TODO (you, before Play Store submission): this page is a structural
// starting point, not final legal copy. Have this reviewed (a lawyer, or
// at minimum a proper privacy-policy generator) before it's your real
// policy, and make sure the wording matches — word for word in spirit —
// what you declare in Play Console's Data Safety form. Google cross-checks
// the two; a mismatch is a common rejection reason.
export default function PrivacyPage() {
  return (
    <Screen>
      <ScreenTitle>Privacy Policy</ScreenTitle>
      <div className="flex w-full flex-col gap-5 text-sm text-parchment/80">
        <p className="text-parchment/60">
          Last updated: TODO — set this date when the real policy ships. This page is a starting
          structure, not final legal wording — see the TODOs below.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-parchment">Account &amp; sign-in</h2>
          <p>
            Every device gets an anonymous session automatically (no account needed to host or
            join a room). If you choose to link an email — to subscribe, save patterns, or buy a
            pack — that email is used only for sign-in and Stripe billing correspondence.
          </p>
          <p className="rounded-2xl border-2 border-coral/40 bg-coral/10 p-3 text-xs font-semibold text-coral">
            TODO: state plainly what the linked email is (and isn&apos;t) used for — sign-in
            only, no marketing emails, no sharing with third parties beyond what&apos;s disclosed
            here — and confirm this matches the Data Safety form&apos;s answer for the &quot;email
            address&quot; data type.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-parchment">Gameplay &amp; room data</h2>
          <p>
            Room codes, player names, scores, and the patterns used in a round are stored in our
            Supabase database for as long as needed to run the game. Custom patterns players write
            in are scoped to that room&apos;s session.
          </p>
          <p className="rounded-2xl border-2 border-coral/40 bg-coral/10 p-3 text-xs font-semibold text-coral">
            TODO: state Supabase as the data processor/sub-processor, describe retention (rooms
            never auto-delete today — decide and document a real retention window before
            launch), and confirm this matches the Data Safety form&apos;s answers for
            &quot;app activity&quot; / &quot;app info and performance&quot; data types.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-lg font-bold text-parchment">Billing</h2>
          <p>
            Subscriptions and pack purchases are handled entirely by Stripe. We never see or store
            your card details — Stripe processes payment and tells us only whether you&apos;re
            subscribed and which packs you&apos;ve bought.
          </p>
          <p className="rounded-2xl border-2 border-coral/40 bg-coral/10 p-3 text-xs font-semibold text-coral">
            TODO: link Stripe&apos;s own privacy policy, and confirm this matches the Data Safety
            form&apos;s answer for &quot;financial info&quot; (should be marked as collected by a
            third party — Stripe — not by this app directly).
          </p>
        </section>

        <p className="rounded-2xl border-2 border-ink/10 bg-parchment/5 p-3 text-xs font-medium text-parchment/50">
          TODO: contact method for privacy requests (data deletion, questions) — required by Play
          Console and most privacy laws. A support email is the minimum.
        </p>
      </div>
      <Link href="/">
        <Button variant="ghost">Back home</Button>
      </Link>
    </Screen>
  );
}
