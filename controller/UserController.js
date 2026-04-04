const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/UserModels");
const Message = require("../models/Message"); // New: message model
const cloudinary = require("../config/Cloudinary");

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
  if (await User.findOne({ email })) {
    res.status(400);
    throw new Error("User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, password: hashedPassword, isVerified: true });
  const token = generateToken(user._id);

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000,
  });

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
    avatar: user.avatar || null,
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
    avatar: user.avatar || null,
  });
});

// ================= LOGOUT =================
const logoutUser = asyncHandler(async (req, res) => {
  res.cookie("token", "", { httpOnly: true, expires: new Date(0) });
  res.status(200).json({ message: "Logged out successfully" });
});

// ================= SEND MOOD =================
const sendMood = asyncHandler(async (req, res) => {
  const { mood } = req.body;
  if (!mood) {
    res.status(400);
    throw new Error("Mood is required");
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  user.mood = mood;
  await user.save();

  if (req.io) {
    req.io.emit("activity:event", {
      type: "USER_MOOD",
      user: user.name,
      userId: user._id,
      mood,
      timestamp: Date.now(),
    });
  }

  res.status(200).json({ message: "Mood sent successfully", mood });
});

// ================= CHAT FUNCTIONALITY =================

// Send message
const sendMessage = asyncHandler(async (req, res) => {
  const { toUserId, message } = req.body;

  if (!toUserId || !message) {
    res.status(400);
    throw new Error("Recipient and message are required");
  }

  const newMessage = await Message.create({
    fromUser: req.user._id,
    toUser: toUserId,
    message,
  });

  // Emit real-time event to recipient and sender
  if (req.io) {
    req.io.to(toUserId.toString()).emit("receiveMessage", newMessage);
    req.io.to(req.user._id.toString()).emit("receiveMessage", newMessage);
  }

  res.status(201).json({ message: "Message sent", data: newMessage });
});

// Fetch messages between two users
const getMessages = asyncHandler(async (req, res) => {
  const { otherUserId } = req.params;
  if (!otherUserId) {
    res.status(400);
    throw new Error("Other user ID is required");
  }

  const messages = await Message.find({
    $or: [
      { fromUser: req.user._id, toUser: otherUserId },
      { fromUser: otherUserId, toUser: req.user._id },
    ],
  })
    .sort({ createdAt: 1 })
    .populate("fromUser", "name avatar")
    .populate("toUser", "name avatar");

  res.json({ messages });
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
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  user.resetPasswordToken = hashedToken;
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  await user.save();

  res.json({ message: "Reset token generated", resetToken });
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

  res.json({ message: "Password reset successful" });
});

// ================= WELCOME =================
const welcome = asyncHandler(async (req, res) => {
  res.json({ message: `Good ${getTimeOfDay()}, ${req.user.name}!` });
});

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

// ================= UPDATE AVATAR =================
const updateAvatar = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (req.user._id.toString() !== userId) {
    res.status(403);
    throw new Error("Not authorized");
  }
  if (!req.file) {
    res.status(400);
    throw new Error("No file uploaded");
  }

  try {
    const avatarUrl = req.file.path || req.file.filename || req.file.url;
    const user = await User.findById(userId);
    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    user.avatar = avatarUrl;
    await user.save();

    res.status(200).json({ success: true, avatar: user.avatar });
  } catch (err) {
    console.error("Avatar update error:", err);
    res.status(500).json({ success: false, message: "Avatar update failed" });
  }
});

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  welcome,
  sendMood,
  generateToken,
  updateAvatar,
  sendMessage, // ✅ new
  getMessages, // ✅ new
};
