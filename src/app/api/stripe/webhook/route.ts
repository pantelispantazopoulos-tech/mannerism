import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database, SubscriptionStatus } from "@/lib/supabase/types";

// PAYMENTS / TEST -> LIVE: `STRIPE_WEBHOOK_SECRET` is the signing secret
// for *this specific* webhook endpoint. Stripe issues a separate secret
// per endpoint per mode, so when you add the live endpoint in the Stripe
// Dashboard (Developers -> Webhooks) you'll get a new `whsec_...` value —
// set that as STRIPE_WEBHOOK_SECRET in the production environment
// alongside the live STRIPE_SECRET_KEY (see src/lib/stripe/server.ts).
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      // canceled, incomplete, incomplete_expired, paused
      return "canceled";
  }
}

async function syncSubscription(supabaseAdmin: SupabaseClient<Database>, subscription: Stripe.Subscription) {
  const supabaseUserId = subscription.metadata?.supabase_user_id;
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  // current_period_end lives on the subscription item, not the
  // subscription itself, as of the API version this SDK targets.
  const periodEndUnix = subscription.items.data[0]?.current_period_end;
  const subscribedUntil = periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null;
  const status = mapStripeStatus(subscription.status);

  const patch = {
    subscription_status: status,
    subscribed_until: subscribedUntil,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    updated_at: new Date().toISOString(),
  };

  if (supabaseUserId) {
    await supabaseAdmin.from("users").update(patch).eq("id", supabaseUserId);
  } else {
    // Fallback for events that somehow arrive without our metadata (e.g. a
    // subscription created outside the checkout route) — match by the
    // Stripe customer id we stored during checkout instead.
    await supabaseAdmin.from("users").update(patch).eq("stripe_customer_id", customerId);
  }
}

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();

  // Signature verification needs the exact raw request bytes — reading it
  // as text before any JSON parsing is what makes that possible with an
  // App Router route handler (there's no body-parser to disable here,
  // unlike the old Pages API routes).
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await syncSubscription(supabaseAdmin, subscription);
      } else if (session.mode === "payment" && session.metadata?.pack_name) {
        // A one-time $1 pack purchase (see checkout-pack/route.ts) — no
        // subscription object exists for this session, so the pack name
        // and buyer travel in the session's own metadata instead.
        const supabaseUserId = session.metadata.supabase_user_id ?? session.client_reference_id;
        if (supabaseUserId) {
          const paymentIntentId =
            typeof session.payment_intent === "string" ? session.payment_intent : null;
          await supabaseAdmin
            .from("pack_purchases")
            .upsert(
              {
                user_id: supabaseUserId,
                pack_name: session.metadata.pack_name,
                stripe_payment_intent_id: paymentIntentId,
              },
              { onConflict: "user_id,pack_name" }
            );
        }
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      await syncSubscription(supabaseAdmin, event.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const supabaseUserId = subscription.metadata?.supabase_user_id;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      const patch = { subscription_status: "canceled" as const, updated_at: new Date().toISOString() };
      if (supabaseUserId) {
        await supabaseAdmin.from("users").update(patch).eq("id", supabaseUserId);
      } else {
        await supabaseAdmin.from("users").update(patch).eq("stripe_customer_id", customerId);
      }
      break;
    }
    default:
      // Ignore everything else — we only care about subscription state.
      break;
  }

  return NextResponse.json({ received: true });
}
