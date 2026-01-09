// Stripe subscription routes
import express from "express";
import Stripe from "stripe";
import { supabaseAdmin } from "../services/supabase.service.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create Stripe checkout session
 * POST /api/stripe/create-checkout
 */
router.post("/create-checkout", async (req, res) => {
  try {
    const { userId, priceId, tier } = req.body;

    if (!userId || !priceId || !tier) {
      return res.status(400).json({
        error: "Missing required fields: userId, priceId, tier",
      });
    }

    // Get user profile
    const { data: user, error: userError } = await supabaseAdmin
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if user already has a Stripe customer ID
    let customerId = user.stripe_customer_id;

    // Verify customer exists in Stripe (handle stale/invalid IDs)
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);

        // Check if customer is deleted
        if (customer.deleted) {
          console.log(
            `⚠️  Customer ${customerId} is deleted, creating new one`
          );
          customerId = null;

          // Clear invalid customer ID from database
          await supabaseAdmin
            .from("user_profiles")
            .update({ stripe_customer_id: null })
            .eq("id", userId);
        } else {
          console.log(`Using existing Stripe customer ${customerId}`);
        }
      } catch (error) {
        console.log(`⚠️  Invalid customer ID ${customerId}, creating new one`);
        console.error("Stripe error:", error.type, error.message);
        customerId = null;

        // Clear invalid customer ID from database
        await supabaseAdmin
          .from("user_profiles")
          .update({ stripe_customer_id: null })
          .eq("id", userId);
      }
    }

    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: userId,
        },
      });
      customerId = customer.id;

      // Save customer ID to database
      await supabaseAdmin
        .from("user_profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.FRONTEND_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?canceled=true`,
      metadata: {
        supabase_user_id: userId,
        subscription_tier: tier,
      },
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("❌ Stripe checkout error:", error);
    res.status(500).json({
      error: "Failed to create checkout session",
      message: error.message,
    });
  }
});

/**
 * Create authenticated Stripe checkout session (with 30-day trial)
 * POST /api/stripe/create-checkout-session
 * Requires: JWT authentication
 */
router.post("/create-checkout-session", async (req, res) => {
  try {
    // 1. Verify authentication (extract user from JWT)
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Unauthorized - No token provided" });
    }

    const token = authHeader.substring(7);

    // Verify token with Supabase
    const { supabase } = await import("../services/supabase.service.js");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }

    // 2. Validate request body
    const { priceId, successUrl, cancelUrl } = req.body;

    if (!priceId) {
      return res.status(400).json({ error: "priceId is required" });
    }

    // 3. Whitelist price IDs (security: prevent price manipulation)
    const validPriceIds = [
      "price_1SmjUwPTMZtSbksSmAXGJFh3", // Starter $19
      "price_1SmjVkPTMZtSbksSquXxtc5S", // Growth $49
      "price_1SmjWIPTMZtSbksSh7jc1009", // Pro $79
      "price_1SmjWmPTMZtSbksSGjhIoOlj", // Business $199
    ];

    if (!validPriceIds.includes(priceId)) {
      return res.status(400).json({ error: "Invalid price ID" });
    }

    // 4. Get or create Stripe customer
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .single();

    if (profileError || !userProfile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    let customerId = userProfile.stripe_customer_id;

    // Verify customer exists in Stripe (handle stale/invalid IDs)
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);

        // Check if customer is deleted
        if (customer.deleted) {
          console.log(
            `⚠️  Customer ${customerId} is deleted, creating new one`
          );
          customerId = null;

          // Clear invalid customer ID from database
          await supabaseAdmin
            .from("user_profiles")
            .update({ stripe_customer_id: null })
            .eq("id", user.id);
        } else {
          console.log(`Using existing Stripe customer ${customerId}`);
        }
      } catch (error) {
        console.log(`⚠️  Invalid customer ID ${customerId}, creating new one`);
        console.error("Stripe error:", error.type, error.message);
        customerId = null;

        // Clear invalid customer ID from database
        await supabaseAdmin
          .from("user_profiles")
          .update({ stripe_customer_id: null })
          .eq("id", user.id);
      }
    }

    if (!customerId) {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;

      // Save customer ID to database
      await supabaseAdmin
        .from("user_profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);

      console.log(
        `Created Stripe customer ${customerId} for user ${user.id}`
      );
    }

    // 5. Determine tier from price ID
    const tierMap = {
      price_1SmjUwPTMZtSbksSmAXGJFh3: "starter",
      price_1SmjVkPTMZtSbksSquXxtc5S: "growth",
      price_1SmjWIPTMZtSbksSh7jc1009: "pro",
      price_1SmjWmPTMZtSbksSGjhIoOlj: "business",
    };
    const tier = tierMap[priceId];

    // 6. Create Stripe Checkout Session with 30-day trial
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url:
        successUrl ||
        `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/payment-cancel`,

      client_reference_id: user.id,
      subscription_data: {
        trial_period_days: 30, // 🎯 30-DAY FREE TRIAL
        metadata: {
          supabase_user_id: user.id,
          subscription_tier: tier,
        },
      },
      metadata: {
        supabase_user_id: user.id,
        subscription_tier: tier,
      },
    });

    console.log(
      `Created checkout session ${session.id} for user ${user.id} (${tier} tier, 30-day trial)`
    );

    // 7. Return checkout URL
    res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("❌ Stripe checkout session error:", error);
    res.status(500).json({
      error: "Failed to create checkout session",
      details: error.message,
    });
  }
});

/**
 * Verify Stripe checkout session and update user subscription
 * GET /api/stripe/verify-session
 * Requires: JWT authentication via query params
 */
router.get("/verify-session", async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: "Session ID is required" });
    }

    // 1. Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ error: "Unauthorized - No token provided" });
    }

    const token = authHeader.substring(7);

    // Verify token with Supabase
    const { supabase } = await import("../services/supabase.service.js");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }

    // 2. Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["subscription", "customer"],
    });

    // 3. Verify session belongs to authenticated user
    if (session.client_reference_id !== user.id) {
      return res.status(403).json({ error: "Unauthorized access to session" });
    }

    // 4. Get subscription details
    const subscription = session.subscription;

    if (!subscription || typeof subscription === "string") {
      return res.status(400).json({ error: "No subscription found" });
    }

    // 5. Map price ID to plan name
    const priceId = subscription.items.data[0].price.id;
    const planMap = {
      price_1SmjUwPTMZtSbksSmAXGJFh3: "Starter Plan",
      price_1SmjVkPTMZtSbksSquXxtc5S: "Growth Plan",
      price_1SmjWIPTMZtSbksSh7jc1009: "Pro Plan",
      price_1SmjWmPTMZtSbksSGjhIoOlj: "Business Plan",
    };

    const planName = planMap[priceId] || "Unknown Plan";
    const amount = subscription.items.data[0].price.unit_amount / 100; // Convert cents to dollars

    // 6. Calculate trial end and next billing date
    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "No trial";

    const nextBillingDate = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toLocaleDateString(
          "en-US",
          {
            year: "numeric",
            month: "long",
            day: "numeric",
          }
        )
      : "N/A";

    // 7. Update user in Supabase
    const { error: updateError } = await supabaseAdmin
      .from("user_profiles")
      .update({
        subscription_status: subscription.status, // 'trialing', 'active', etc.
        subscription_tier: planName.toLowerCase().replace(" plan", ""), // 'starter', 'growth', etc.
        stripe_subscription_id: subscription.id,
        trial_end_date: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("❌ Error updating user profile:", updateError);
      // Don't fail the request, just log the error
    } else {
      console.log(
        `Updated subscription for user ${user.id}: ${planName} (${subscription.status})`
      );
    }

    // 8. Return formatted data to frontend
    res.json({
      customerEmail: session.customer_details?.email || user.email,
      planName,
      amount,
      trialEnd,
      nextBillingDate,
    });
  } catch (error) {
    console.error("❌ Session verification error:", error);
    res.status(500).json({ error: "Failed to verify session" });
  }
});

/**
 * Get user's current subscription status
 * GET /api/stripe/subscription/:userId
 */
router.get("/subscription/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: user, error } = await supabaseAdmin
      .from("user_profiles")
      .select("subscription_tier, subscription_status, stripe_subscription_id")
      .eq("id", userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "User not found" });
    }

    // If user has a Stripe subscription, get details from Stripe
    let subscriptionDetails = null;
    if (user.stripe_subscription_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(
          user.stripe_subscription_id
        );
        subscriptionDetails = {
          status: subscription.status,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: subscription.cancel_at_period_end,
        };
      } catch (stripeError) {
        console.error("Error fetching Stripe subscription:", stripeError);
      }
    }

    res.json({
      success: true,
      tier: user.subscription_tier,
      status: user.subscription_status,
      stripeDetails: subscriptionDetails,
    });
  } catch (error) {
    console.error("❌ Error fetching subscription:", error);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

/**
 * Cancel subscription (at period end)
 * POST /api/stripe/cancel-subscription
 */
router.post("/cancel-subscription", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Get user's subscription
    const { data: user, error: userError } = await supabaseAdmin
      .from("user_profiles")
      .select("stripe_subscription_id")
      .eq("id", userId)
      .single();

    if (userError || !user || !user.stripe_subscription_id) {
      return res.status(404).json({ error: "No active subscription found" });
    }

    // Cancel at period end (don't cancel immediately)
    const subscription = await stripe.subscriptions.update(
      user.stripe_subscription_id,
      {
        cancel_at_period_end: true,
      }
    );

    res.json({
      success: true,
      message: "Subscription will cancel at period end",
      cancels_at: subscription.current_period_end,
    });
  } catch (error) {
    console.error("❌ Cancel subscription error:", error);
    res.status(500).json({
      error: "Failed to cancel subscription",
      message: error.message,
    });
  }
});

export default router;
