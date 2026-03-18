const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/UserModels");

// ================= TOKEN GENERATOR =================
const generateToken = (id, expiresIn = "1d") => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn });
};

// ================= REGISTER =================
const registerUser = asyncHandler(async (req, res) => {
  let { name, email, password, confirmPassword } = req.body;

  email = email?.toLowerCase().trim();

  if (!name || !email || !password || !confirmPassword) {
    res.status(400);
    throw new Error("All fields are required");
  }

  if (password !== confirmPassword) {
    res.status(400);
    throw new Error("Passwords do not match");
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    isVerified: true,
  });

  const token = generateToken(user._id);

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000,
  });

  // Emit socket event
  if (req.io) {
    req.io.emit("activity:event", {
      type: "USER_ONLINE",
      user: user.name,
      userId: user._id,
      timestamp: Date.now(),
    });
  }

  res.status(201).json({
    message: "Registration successful",
    _id: user._id,
    name: user.name,
    email: user.email,
    token,
    isAdmin: user.isAdmin,
  });
});

// ================= LOGIN =================
const loginUser = asyncHandler(async (req, res) => {
  let { email, password } = req.body;

  email = email?.toLowerCase().trim();

  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  user.online = true;
  await user.save();

  if (req.io) {
    req.io.emit("activity:event", {
      type: "USER_ONLINE",
      user: user.name,
      userId: user._id,
      timestamp: Date.now(),
    });
  }

  const token = generateToken(user._id);

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000,
  });

  res.json({
    _id: user._id,
    name: user.name,
    email: user.email,
    token,
    isAdmin: user.isAdmin,
  });
});

// ================= LOGOUT =================
const logoutUser = asyncHandler(async (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0),
  });

  res.status(200).json({ message: "Logged out successfully" });
});

// ================= FORGOT PASSWORD =================
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const resetToken = crypto.randomBytes(32).toString("hex");

  // ✅ HASH TOKEN BEFORE SAVING
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  user.resetPasswordToken = hashedToken;
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  await user.save();

  res.json({
    message: "Reset token generated",
    resetToken, // send raw token to user (email in real app)
  });
});

// ================= RESET PASSWORD =================
const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error("Invalid or expired token");
  }

  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();

  res.json({
    message: "Password reset successful",
  });
});

// ================= WELCOME =================
const welcome = asyncHandler(async (req, res) => {
  res.json({
    message: `Good ${getTimeOfDay()}, ${req.user.name}!`,
  });
});

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

module.exports = {
  registerUser,
  loginUser,
  logoutUser, // ✅ added
  forgotPassword,
  resetPassword,
  welcome,
  generateToken,
};
