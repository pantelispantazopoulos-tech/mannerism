import { NextRequest, NextResponse } from "next/server";
import { getStripe, SUBSCRIPTION_PRICE_USD_CENTS } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Creates a Stripe Checkout Session for the $4.99/month subscription and
// hands the client back a URL to redirect the browser to. The client sends
// its Supabase access token in the Authorization header; we verify it
// server-side rather than trusting a user id from the request body.
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
  const user = userData.user;
  if (!user.email) {
    // Subscribing requires a real, confirmed email — see useAccount.ts.
    // Anonymous sessions (no email yet) never reach this point in the UI,
    // but double-check server-side too.
    return NextResponse.json(
      { error: "Link an email to your account before subscribing" },
      { status: 400 }
    );
  }

  const { returnTo } = (await request.json().catch(() => ({}))) as { returnTo?: string };
  const origin = new URL(request.url).origin;
  const safeReturnTo = returnTo && returnTo.startsWith("/") ? returnTo : "/premium";

  // Reuse an existing Stripe customer if this Supabase user already has
  // one (e.g. a previous canceled subscription), otherwise create one now
  // and store it immediately so a retry doesn't create a duplicate.
  const { data: appUser } = await supabaseAdmin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  let customerId = appUser?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabaseAdmin
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: SUBSCRIPTION_PRICE_USD_CENTS,
          recurring: { interval: "month" },
          product_data: {
            name: "Mannerism Premium",
            description: "Custom pattern library, the shared pattern pool, and all premium packs.",
          },
        },
      },
    ],
    // Renewal/cancellation webhook events (customer.subscription.updated /
    // .deleted) don't carry client_reference_id, only checkout.session.
    // completed does — so the Supabase user id also goes on the
    // subscription's own metadata, which every event type does include.
    subscription_data: {
      metadata: { supabase_user_id: user.id },
    },
    success_url: `${origin}${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}checkout=success`,
    cancel_url: `${origin}${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}checkout=canceled`,
  });

  return NextResponse.json({ url: session.url });
}
