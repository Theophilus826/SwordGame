const express = require('express');
const router = express.Router();

const {
    getFeedbacks,
    getFeedback,
    createFeedback,
    updateFeedback,
    deleteFeedback
} = require('../controller/FeedbackController');

const { protect } = require('../middleware/AuthMiddleware');

// Routes for all feedbacks
router
    .route('/')
    .get(protect, getFeedbacks)      // Get all feedbacks for logged-in user
    .post(protect, createFeedback);  // Create new feedback

// Routes for single feedback
router
    .route('/:id')
    .get(protect, getFeedback)       // Get single feedback by ID
    .put(protect, updateFeedback)    // Update feedback (status)
    .delete(protect, deleteFeedback);// Delete feedback

module.exports = router;
