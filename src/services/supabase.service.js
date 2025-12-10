// Supabase client - connects to your database
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

// Admin client (can bypass RLS for backend operations)
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Regular client (respects RLS)
export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey
);

// Helper functions
export const supabaseService = {
  // Get user profile
  async getUserProfile(userId) {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  // Create user profile (called after signup)
  async createUserProfile(userId, profileData = {}) {
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .insert({
        id: userId,
        ...profileData,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get user's GA4 connections
  async getGA4Connections(userId) {
    const { data, error } = await supabaseAdmin
      .from('ga4_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;
    return data;
  },

  // Save daily insights
  async saveDailyInsights(userId, ga4ConnectionId, insights) {
    const insightsToInsert = insights.map((insight, index) => ({
      user_id: userId,
      ga4_connection_id: ga4ConnectionId,
      insight_date: new Date().toISOString().split('T')[0],
      priority: index + 1,
      ...insight,
    }));

    const { data, error } = await supabaseAdmin
      .from('daily_insights')
      .insert(insightsToInsert)
      .select();

    if (error) throw error;
    return data;
  },
};