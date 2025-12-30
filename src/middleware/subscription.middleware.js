// Subscription & Property Limit Middleware
import { supabaseAdmin } from "../services/supabase.service.js";

// Plan limits configuration
const PLAN_LIMITS = {
  free: {
    properties: 1,
    name: "Free",
  },
  pro: {
    properties: 4,
    name: "Pro",
  },
  business: {
    properties: Infinity,
    name: "Business",
  },
};

/**
 * Check if user's free trial has expired
 */
export const checkTrialStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user's subscription
    const { data: subscription, error } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows, which means no subscription yet
      console.error("Subscription check error:", error);
      return res.status(500).json({ error: "Failed to check subscription" });
    }

    // If no subscription exists, create free tier
    if (!subscription) {
      const { data: newSub, error: createError } = await supabaseAdmin
        .from("subscriptions")
        .insert({
          user_id: userId,
          plan_type: "free",
          status: "active",
          trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        })
        .select()
        .single();

      if (createError) {
        console.error("Failed to create subscription:", createError);
        return res.status(500).json({ error: "Failed to create subscription" });
      }

      req.subscription = newSub;
      return next();
    }

    // Check if trial expired for free users
    if (subscription.plan_type === "free") {
      const trialEndsAt = new Date(subscription.trial_ends_at);
      const now = new Date();

      if (now > trialEndsAt) {
        return res.status(403).json({
          error: "Free trial expired",
          message:
            "Your 30-day free trial has ended. Please upgrade to continue using GobbleData.",
          trialEndedAt: subscription.trial_ends_at,
          upgradeRequired: true,
        });
      }
    }

    // Attach subscription to request
    req.subscription = subscription;
    next();
  } catch (error) {
    console.error("Trial check error:", error);
    res.status(500).json({ error: "Failed to verify trial status" });
  }
};

/**
 * Check if user can add more properties based on their plan
 */
export const checkPropertyLimit = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const subscription = req.subscription; // Should be set by checkTrialStatus

    if (!subscription) {
      return res.status(500).json({ error: "Subscription not found" });
    }

    const planType = subscription.plan_type || "free";
    const planLimit = PLAN_LIMITS[planType];

    if (!planLimit) {
      console.error("Unknown plan type:", planType);
      return res.status(500).json({ error: "Invalid subscription plan" });
    }

    // Get current active connections count
    const { data: connections, error } = await supabaseAdmin
      .from("ga4_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) {
      console.error("Failed to count connections:", error);
      return res.status(500).json({ error: "Failed to check property limit" });
    }

    const currentCount = connections?.length || 0;
    const limit = planLimit.properties;

    // Check if at or over limit
    if (currentCount >= limit) {
      return res.status(403).json({
        error: "Property limit reached",
        currentPlan: planType,
        limit: limit === Infinity ? "Unlimited" : limit,
        current: currentCount,
        upgradeRequired: planType !== "business",
        message: `You've reached your ${planLimit.name} plan limit of ${
          limit === Infinity ? "unlimited" : limit
        } ${limit === 1 ? "property" : "properties"}.`,
      });
    }

    // Attach limit info to request
    req.propertyLimit = {
      plan: planType,
      planName: planLimit.name,
      limit: limit,
      current: currentCount,
      remaining: limit === Infinity ? Infinity : limit - currentCount,
    };

    next();
  } catch (error) {
    console.error("Property limit check error:", error);
    res.status(500).json({ error: "Failed to verify property limit" });
  }
};
