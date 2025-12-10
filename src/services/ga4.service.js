// GA4 Service - Handles Google Analytics API OAuth and data fetching
import { google } from 'googleapis';
import { config } from '../config/index.js';

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  config.ga4.clientId,
  config.ga4.clientSecret,
  config.ga4.redirectUri
);

// Scopes we need (read-only access to Analytics)
const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];

export const ga4Service = {
  /**
   * Generate Google OAuth URL
   * User will be redirected here to authorize
   */
  getAuthUrl(userId) {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Gets refresh token
      scope: SCOPES,
      state: userId, // Pass user ID through OAuth flow
      prompt: 'consent', // Force consent screen (ensures refresh token)
    });
    return authUrl;
  },

  /**
   * Exchange authorization code for tokens
   */
  async getTokensFromCode(code) {
    try {
      const { tokens } = await oauth2Client.getToken(code);
      return tokens;
    } catch (error) {
      console.error('Error exchanging code for tokens:', error);
      throw new Error('Failed to get tokens from authorization code');
    }
  },

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken) {
    try {
      oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });
      const { credentials } = await oauth2Client.refreshAccessToken();
      return credentials;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw new Error('Failed to refresh access token');
    }
  },

  /**
   * Get user's GA4 properties
   */
  async getGA4Properties(accessToken) {
    try {
      oauth2Client.setCredentials({
        access_token: accessToken,
      });

      const analyticsAdmin = google.analyticsadmin({
        version: 'v1beta',
        auth: oauth2Client,
      });

      // List all account summaries (includes properties)
      const response = await analyticsAdmin.accountSummaries.list();
      
      const properties = [];
      
      if (response.data.accountSummaries) {
        response.data.accountSummaries.forEach(account => {
          if (account.propertySummaries) {
            account.propertySummaries.forEach(property => {
              // Only include GA4 properties (they start with "properties/")
              if (property.property && property.property.includes('properties/')) {
                properties.push({
                  propertyId: property.property.replace('properties/', ''),
                  propertyName: property.displayName,
                  accountName: account.displayName,
                });
              }
            });
          }
        });
      }

      return properties;
    } catch (error) {
      console.error('Error fetching GA4 properties:', error);
      throw new Error('Failed to fetch GA4 properties');
    }
  },

  /**
   * Fetch GA4 metrics data (we'll implement this in Day 5-6)
   */
  async fetchMetrics(propertyId, accessToken, dateRange = '14daysAgo') {
    // TODO: Implement in Week 1 Day 5-6
    console.log('fetchMetrics - coming in Day 5-6');
    return null;
  },
};