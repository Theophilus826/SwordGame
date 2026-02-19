const express = require('express');
const router = express.Router();
const { registerUser, loginUser, forgotPassword, resetPassword, welcome } = require('../controller/UserController');
const { protect } = require('../middleware/authMiddleware'); // middleware to protect routes

// Auth routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);

// Protected route example
router.get('/welcome', protect, welcome);

module.exports = router;
