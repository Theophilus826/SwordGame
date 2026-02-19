const asyncHandler = require('express-async-handler');
const User = require('../models/UserModels');
const Feedback = require('../models/FeedbackModels');

// ===============================
// @desc    Get all feedbacks for logged-in user
// @route   GET /api/feedbacks
// @access  Private
// ===============================
const getFeedbacks = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) {
        res.status(401);
        throw new Error('User not found');
    }

    const { club, status, description } = req.query;

    const query = { user: req.user.id };

    if (club) query.club = club;
    if (status) query.status = status.toLowerCase();
    if (description) {
        query.description = { $regex: description, $options: 'i' };
    }

    const feedbacks = await Feedback.find(query).sort({ createdAt: -1 });

    res.status(200).json(feedbacks);
});

// ===============================
// @desc    Get single feedback
// @route   GET /api/feedbacks/:id
// @access  Private
// ===============================
const getFeedback = asyncHandler(async (req, res) => {
    const feedback = await Feedback.findOne({
        _id: req.params.id,
        user: req.user.id
    });

    if (!feedback) {
        res.status(404);
        throw new Error('Feedback not found');
    }

    res.status(200).json(feedback);
});

// ===============================
// @desc    Create new feedback
// @route   POST /api/feedbacks
// @access  Private
// ===============================
const createFeedback = asyncHandler(async (req, res) => {
    const { club, description } = req.body;

    if (!club || !description) {
        res.status(400);
        throw new Error('Club and description are required');
    }

    const feedback = await Feedback.create({
        user: req.user.id,
        club: club.trim(),
        description: description.trim(),
        status: 'new'
    });

    res.status(201).json(feedback);
});

// ===============================
// @desc    Update feedback status
// @route   PUT /api/feedbacks/:id
// @access  Private
// ===============================
const updateFeedback = asyncHandler(async (req, res) => {
    const feedback = await Feedback.findById(req.params.id);

    if (!feedback) {
        res.status(404);
        throw new Error('Feedback not found');
    }

    if (feedback.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized');
    }

    feedback.status = req.body.status || feedback.status;

    const updatedFeedback = await feedback.save();

    res.status(200).json(updatedFeedback);
});

// ===============================
// @desc    Delete feedback
// @route   DELETE /api/feedbacks/:id
// @access  Private
// ===============================
const deleteFeedback = asyncHandler(async (req, res) => {
    const feedback = await Feedback.findById(req.params.id);

    if (!feedback) {
        res.status(404);
        throw new Error('Feedback not found');
    }

    if (feedback.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized');
    }

    await feedback.deleteOne();

    res.status(200).json({ message: 'Feedback deleted successfully' });
});

module.exports = {
    getFeedbacks,
    getFeedback,
    createFeedback,
    updateFeedback,
    deleteFeedback
};
