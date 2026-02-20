const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const User = require('../models/UserModels');

// ================= TOKEN GENERATOR =================
const generateToken = (id, expiresIn = '1d') => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn });
};

// ================= REGISTER =================
const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    if (!email || !password || !confirmPassword) {
        res.status(400);
        throw new Error('All fields are required');
    }

    if (password !== confirmPassword) {
        res.status(400);
        throw new Error('Passwords do not match');
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
        name,
        email,
        password: hashedPassword,
        isVerified: true, // auto-verified
    });

    const token = generateToken(user._id, '1d');

    res.cookie("token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
        message: 'Registration successful. You are now logged in.',
        _id: user._id,
        name: user.name,
        email: user.email,
        token,
    });
});

// ================= LOGIN =================
const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        res.status(401);
        throw new Error("Invalid credentials");
    }

    // ✅ Mark user online
    user.online = true;
    await user.save();

    // ✅ Emit Live Activity
    req.io.emit("activity:event", {
        type: "USER_ONLINE",
        user: user.name,
        userId: user._id,
        timestamp: Date.now(),
    });

    const token = generateToken(user._id, "1d");

    res.cookie("token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: false, // switch to true in production
        maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        token,
        isAdmin: user.isAdmin,
    });
});

// ================= FORGOT PASSWORD =================
// Temporarily disable email sending
const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await user.save();

    // Skip sending email
    res.status(200).json({
        message: 'Password reset token generated (email sending disabled in this build).',
        resetToken, // optional: return token for dev/testing
    });
});

// ================= RESET PASSWORD =================
const resetPassword = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
        res.status(400);
        throw new Error('Invalid or expired token');
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.status(200).json({
        message: 'Password reset successful. You can now log in.',
    });
});

// ================= WELCOME (PROTECTED) =================
const welcome = asyncHandler(async (req, res) => {
    res.status(200).json({
        message: `Good ${getTimeOfDay()}, ${req.user.name}!`,
    });
});

function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Morning';
    if (hour < 18) return 'Afternoon';
    return 'Evening';
}

module.exports = {
    registerUser,
    loginUser,
    forgotPassword,
    resetPassword,
    welcome,
    generateToken, // export token generator
};
