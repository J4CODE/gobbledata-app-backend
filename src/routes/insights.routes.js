// Insights routes - fetch user's insights
import express from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';

const router = express.Router();

// TODO: Implement insights fetching (Week 1 Day 5-7)
router.get('/today', authenticateUser, (req, res) => {
  res.json({ message: 'Today\'s insights - coming in Day 5-7' });
});

export default router;