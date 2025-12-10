// Auth routes - user profile management
import express from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { supabaseService } from '../services/supabase.service.js';

const router = express.Router();

// Get current user profile
router.get('/profile', authenticateUser, async (req, res) => {
  try {
    const profile = await supabaseService.getUserProfile(req.user.id);
    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router;