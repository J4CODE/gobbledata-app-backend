// GA4 Routes - OAuth flow and property management
import express from "express";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { ga4Service } from "../services/ga4.service.js";
import {
  supabaseService,
  supabaseAdmin,
} from "../services/supabase.service.js";
import { config } from "../config/index.js";

const router = express.Router();

/**
 * ROUTE 1: Start OAuth flow
 * GET /api/ga4/connect
 */
router.get("/connect", async (req, res) => {
  try {
    // Get token from query param (temporary for testing)
    const token =
      req.query.token || req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    // Verify token
    const { supabase } = await import("../services/supabase.service.js");
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const userId = user.id;

    // Generate Google OAuth URL
    const authUrl = ga4Service.getAuthUrl(userId);

    console.log("🔗 OAuth URL generated for user:", userId);

    // Redirect user to Google
    res.redirect(authUrl);
  } catch (error) {
    console.error("Connect error:", error);
    res.status(500).json({ error: "Failed to initiate OAuth flow" });
  }
});

/**
 * ROUTE 2: Handle OAuth callback
 * GET /api/ga4/callback?code=xyz&state=userId
 */
router.get("/callback", async (req, res) => {
  try {
    const { code, state: userId } = req.query;

    if (!code) {
      return res.redirect(`${config.frontendUrl}/dashboard?error=no_code`);
    }

    console.log("📥 OAuth callback received for user:", userId);

    // Exchange code for tokens
    const tokens = await ga4Service.getTokensFromCode(code);

    if (!tokens.access_token) {
      return res.redirect(`${config.frontendUrl}/dashboard?error=no_token`);
    }

    console.log("✅ Tokens received");

    // Fetch user's GA4 properties
    // Fetch user's GA4 properties
    let properties;
    try {
      properties = await ga4Service.getGA4Properties(tokens.access_token);
    } catch (propertyError) {
      console.error("❌ Error fetching properties:", propertyError.message);
      // If no properties found, that's okay - continue anyway
      properties = [];
    }

    if (!properties || properties.length === 0) {
      console.log("⚠️  No GA4 properties found - user needs to set one up");
      return res.redirect(
        `${config.frontendUrl}/dashboard?error=no_ga4_properties&message=No GA4 properties found. Please set one up in Google Analytics.`
      );
    }

    console.log(`📊 Found ${properties.length} GA4 properties`);

    // For MVP: Just use first property
    const firstProperty = properties[0];

    // Save connection to database

    const { data, error } = await supabaseAdmin
      .from("ga4_connections")
      .upsert(
        {
          user_id: userId,
          property_id: firstProperty.propertyId,
          property_name: firstProperty.propertyName,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(
            Date.now() + (tokens.expiry_date || 3600000)
          ).toISOString(),
          is_active: true,
          last_synced_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,property_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return res.redirect(`${config.frontendUrl}/dashboard?error=db_error`);
    }

    console.log("💾 Connection saved to database");

    // Redirect back to dashboard with success
    res.redirect(
      `${
        config.frontendUrl
      }/dashboard?ga4_connected=true&property=${encodeURIComponent(
        firstProperty.propertyName
      )}`
    );
  } catch (error) {
    console.error("Callback error:", error);
    res.redirect(`${config.frontendUrl}/dashboard?error=callback_failed`);
  }
});

/**
 * ROUTE 3: Get user's connected properties
 * GET /api/ga4/properties
 */
router.get("/properties", authenticateUser, async (req, res) => {
  try {
    const connections = await supabaseService.getGA4Connections(req.user.id);
    res.json({ connections });
  } catch (error) {
    console.error("Get properties error:", error);
    res.status(500).json({ error: "Failed to fetch properties" });
  }
});

/**
 * ROUTE 4: Disconnect GA4 property
 * DELETE /api/ga4/disconnect/:connectionId
 */
router.delete(
  "/disconnect/:connectionId",
  authenticateUser,
  async (req, res) => {
    try {
      const { connectionId } = req.params;
      const userId = req.user.id;

      const { supabaseAdmin } = await import("../services/supabase.service.js");
      const { error } = await supabaseAdmin
        .from("ga4_connections")
        .update({ is_active: false })
        .eq("id", connectionId)
        .eq("user_id", userId); // Ensure user owns this connection

      if (error) throw error;

      res.json({ success: true, message: "Property disconnected" });
    } catch (error) {
      console.error("Disconnect error:", error);
      res.status(500).json({ error: "Failed to disconnect property" });
    }
  }
);

export default router;
