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

export default router;