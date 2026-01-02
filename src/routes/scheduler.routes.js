// Scheduler Routes - Manual trigger for daily insights job
import express from "express";
const router = express.Router();

/**
 * ROUTE: Manually trigger daily insights job
 * GET /api/scheduler/run-now
 */
router.get("/run-now", async (req, res) => {
  try {
    console.log("[Manual] Triggering daily insights job...");
    const { runNow } = await import("../services/scheduler.service.js");
    const result = await runNow();
    res.json({
      success: true,
      message: "Daily insights job completed",
      ...result,
    });
  } catch (error) {
    console.error("[Manual] Error running daily job:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * ROUTE: Test "no insights" email
 * GET /api/scheduler/test-no-insights
 * FOR TESTING ONLY - Remove before production launch
 */
router.get("/test-no-insights", async (req, res) => {
  try {
    console.log("[Test] Triggering no-insights email test...");

    // Get the first user with email enabled (for testing)
    const { supabaseAdmin } = await import("../services/supabase.service.js");
    const { data: preferences } = await supabaseAdmin
      .from("email_preferences")
      .select("user_id")
      .eq("enabled", true)
      .limit(1)
      .single();

    if (!preferences) {
      return res.status(404).json({
        success: false,
        error: "No users with email enabled found",
      });
    }

    const userId = preferences.user_id;
    console.log(`[Test] Sending no-insights email to user: ${userId}`);

    const { sendNoInsightsEmail } = await import(
      "../services/email.service.js"
    );
    const result = await sendNoInsightsEmail(userId);

    res.json({
      success: true,
      message: "No-insights test email triggered",
      userId,
      emailResult: result,
    });
  } catch (error) {
    console.error("[Test] Error sending no-insights test email:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
