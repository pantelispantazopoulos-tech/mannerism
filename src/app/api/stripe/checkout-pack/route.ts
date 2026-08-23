import { NextRequest, NextResponse } from "next/server";
import { getStripe, PACK_PRICE_USD_CENTS } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Creates a Stripe Checkout Session for a one-time $1 purchase of a single
// premium pack — the alternative to the $4.99/month subscription for a
// player who only wants e.g. the Office pack. Mirrors
// src/app/api/stripe/checkout/route.ts (subscription mode) but with
// `mode: "payment"` and the pack name carried in session metadata, since a
// one-time payment has no subscription object for the webhook to read
// metadata off of later.
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
    return NextResponse.json(
      { error: "Link an email to your account before buying a pack" },
      { status: 400 }
    );
  }

  const { packName, returnTo } = (await request.json().catch(() => ({}))) as {
    packName?: string;
    returnTo?: string;
  };
  if (!packName || typeof packName !== "string") {
    return NextResponse.json({ error: "Missing packName" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const safeReturnTo = returnTo && returnTo.startsWith("/") ? returnTo : "/premium";

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
    mode: "payment",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: PACK_PRICE_USD_CENTS,
          product_data: {
            name: `Mannerism — ${packName}`,
            description: "One-time unlock for this pattern pack.",
          },
        },
      },
    ],
    // A one-time payment session has no subscription object, so this
    // metadata (not subscription_data.metadata) is what the webhook reads
    // off checkout.session.completed to know who bought what.
    metadata: { supabase_user_id: user.id, pack_name: packName },
    success_url: `${origin}${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}checkout=success`,
    cancel_url: `${origin}${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}checkout=canceled`,
  });

  return NextResponse.json({ url: session.url });
}
