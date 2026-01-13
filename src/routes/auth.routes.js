// Auth routes - user profile management
import express from "express";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { supabaseService, supabaseAdmin } from "../services/supabase.service.js";
const router = express.Router();

// Get current user profile
router.get("/profile", authenticateUser, async (req, res) => {
  try {
    const profile = await supabaseService.getUserProfile(req.user.id);
    res.json(profile);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

/**
 * Delete user account
 * POST /api/auth/delete-account
 * Requires: JWT authentication + password confirmation
 */
router.post("/delete-account", authenticateUser, async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user.id;

    // 1. Validate password is provided
    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    // 2. Verify user's password with Supabase
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: req.user.email,
      password: password,
    });

    if (signInError) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // 3. Get user profile to check for Stripe subscription
    const profile = await supabaseService.getUserProfile(userId);

    // 4. Cancel Stripe subscription if exists
    if (profile.stripe_subscription_id) {
      try {
        const stripe = (await import("stripe")).default;
        const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY);

        // Cancel subscription immediately (not at period end)
        await stripeClient.subscriptions.cancel(profile.stripe_subscription_id);

        console.log(
          `Canceled subscription ${profile.stripe_subscription_id} for user ${userId}`
        );
      } catch (stripeError) {
        console.error("Error canceling Stripe subscription:", stripeError);
        // Don't fail the deletion if Stripe cancel fails
        // User might have already canceled manually
      }
    }

    // 5. Delete user data from database (cascading deletes should handle related records)
    // Order matters: delete child records first, then parent

    // Delete daily insights
    await supabaseAdmin.from("daily_insights").delete().eq("user_id", userId);

    // Delete GA4 connections
    await supabaseAdmin.from("ga4_connections").delete().eq("user_id", userId);

    // Delete email preferences
    await supabaseAdmin
      .from("email_preferences")
      .delete()
      .eq("user_id", userId);

    // Delete user profile
    await supabaseAdmin.from("user_profiles").delete().eq("id", userId);

    console.log(`Deleted all database records for user ${userId}`);

    // 6. Delete user from Supabase Auth (this is the final step)
    const { error: deleteAuthError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error("Error deleting user from auth:", deleteAuthError);
      return res.status(500).json({
        error: "Failed to delete account from authentication system",
      });
    }

    console.log(`Successfully deleted user account: ${userId}`);

    // 7. Return success
    res.json({
      success: true,
      message: "Account successfully deleted",
    });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({
      error: "Failed to delete account",
      message: error.message,
    });
  }
});

export default router;
