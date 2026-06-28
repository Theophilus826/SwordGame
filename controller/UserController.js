const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { formatPhone, hashPhone } = require("../config/phone");

const User = require("../models/UserModels");
const Message = require("../models/Message");

const cloudinary = require("../config/Cloudinary");

/* ================= TOKEN ================= */
const generateToken = (id, expiresIn = "7d") => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn,
  });
};

/* ================= REGISTER ================= */
const registerUser = asyncHandler(async (req, res) => {
  let { name, email, phone, password, confirmPassword } = req.body;

  if (!name || !password || !confirmPassword) {
    res.status(400);
    throw new Error("Required fields missing");
  }

  if (password !== confirmPassword) {
    res.status(400);
    throw new Error("Passwords do not match");
  }

  email = email?.toLowerCase().trim();
  const rawPhone = phone?.trim();
  phone = rawPhone ? formatPhone(rawPhone) : undefined;

  if (!email && !phone) {
    res.status(400);
    throw new Error("Provide email or phone");
  }

  if (rawPhone && !phone) {
    res.status(400);
    throw new Error("Invalid phone number");
  }

  const orQuery = [];
  if (email) orQuery.push({ email });
  if (phone) orQuery.push({ phone });

  const existingUser = await User.findOne({ $or: orQuery });

  if (existingUser) {
    res.status(400);
    throw new Error("User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const userData = {
    name,
    password: hashedPassword,
    // mark unverified if registering with phone
    isVerified: phone ? false : true,
    online: true,
  };

  if (email) userData.email = email;
  if (phone) userData.phone = phone;

  const user = await User.create(userData);
  // If phone provided, generate a verification code and don't auto-login
  if (phone) {
    const verificationCode = String(
      crypto.randomInt(100000, 999999)
    );

    const hashedCode = crypto
      .createHash("sha256")
      .update(verificationCode)
      .digest("hex");

    user.phoneVerificationToken = hashedCode;
    user.phoneVerificationExpire = Date.now() + 10 * 60 * 1000;

    await user.save();

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email || null,
      phone: user.phone || null,
      avatar: user.avatar || null,
      isAdmin: user.isAdmin,
      message: "Verification code generated",
      verificationCode,
    });
    return;
  }

  // Email registration: issue token and auto-login
  const token = generateToken(user._id);

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(201).json({
    _id: user._id,
    name: user.name,
    email: user.email || null,
    phone: user.phone || null,
    token,
    avatar: user.avatar || null,
    isAdmin: user.isAdmin,
  });
});

/* ================= LOGIN ================= */
const loginUser = asyncHandler(async (req, res) => {
  let { identifier, password } = req.body;

  if (!identifier || !password) {
    res.status(400);
    throw new Error("Identifier and password required");
  }

  identifier = identifier.trim();

  const formattedPhone = formatPhone(identifier);

  const email = identifier.includes("@")
    ? identifier.toLowerCase()
    : null;

  const user = await User.findOne({
    $or: [
      ...(email ? [{ email }] : []),
      ...(formattedPhone ? [{ phone: formattedPhone }] : []),
    ],
  });

  if (!user) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  const matched = await bcrypt.compare(
    password,
    user.password
  );

  if (!matched) {
    res.status(401);
    throw new Error("Invalid credentials");
  }

  user.online = true;
  user.lastActive = Date.now();

  await user.save();

  const token = generateToken(user._id);

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    _id: user._id,
    name: user.name,
    email: user.email || null,
    phone: user.phone || null,
    avatar: user.avatar || null,
    isAdmin: user.isAdmin,
    token,
  });
});

/* ================= LOGOUT ================= */
const logoutUser = asyncHandler(async (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0),
  });

  res.json({
    message: "Logged out successfully",
  });
});

/* ================= SEND MOOD ================= */
const sendMood = asyncHandler(async (req, res) => {
  const { mood } = req.body;

  if (!mood) {
    res.status(400);
    throw new Error("Mood required");
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

  res.json({
    message: "Mood updated",
    mood,
  });
});

/* ================= SEND MESSAGE ================= */
const sendMessage = asyncHandler(async (req, res) => {
  const { toUserId, text } = req.body;

  if (!toUserId || !text?.trim()) {
    res.status(400);
    throw new Error("Recipient and text required");
  }

  const receiver = await User.findById(toUserId);

  if (!receiver) {
    res.status(404);
    throw new Error("Receiver not found");
  }

  const newMessage = await Message.create({
    fromUser: req.user._id,
    toUser: toUserId,
    text: text.trim(),
  });

  const populatedMessage = await Message.findById(newMessage._id)
    .populate("fromUser", "_id name avatar")
    .populate("toUser", "_id name avatar");

  if (req.io) {
    req.io.to(toUserId.toString()).emit(
      "receiveMessage",
      populatedMessage
    );

    req.io.to(req.user._id.toString()).emit(
      "receiveMessage",
      populatedMessage
    );
  }

  res.status(201).json({
    success: true,
    message: populatedMessage,
  });
});

/* ================= GET CHAT MESSAGES ================= */
const getMessages = asyncHandler(async (req, res) => {
  const { otherUserId } = req.params;

  if (!otherUserId) {
    res.status(400);
    throw new Error("User ID required");
  }

  const messages = await Message.find({
    $or: [
      {
        fromUser: req.user._id,
        toUser: otherUserId,
      },
      {
        fromUser: otherUserId,
        toUser: req.user._id,
      },
    ],
  })
    .sort({ createdAt: 1 })
    .populate("fromUser", "_id name avatar")
    .populate("toUser", "_id name avatar");

  res.json({
    success: true,
    messages,
  });
});

/* ================= GET SINGLE USER ================= */
const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId)
    .select("_id name avatar online lastActive");

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  res.json({
    success: true,
    user: {
      _id: user._id,
      name: user.name,
      avatar: user.avatar || null,
      status: user.online ? "online" : "offline",
      lastActive: user.lastActive,
    },
  });
});

/* ================= FORGOT PASSWORD ================= */
const forgotPassword = asyncHandler(async (req, res) => {
  let { identifier } = req.body;

  if (!identifier) {
    res.status(400);
    throw new Error("Identifier (email or phone) required");
  }

  identifier = String(identifier).trim();

  const isEmail = identifier.includes("@");

  const formattedPhone = isEmail ? null : formatPhone(identifier);

  const user = await User.findOne({
    $or: [
      ...(isEmail ? [{ email: identifier.toLowerCase() }] : []),
      ...(formattedPhone ? [{ phone: formattedPhone }] : []),
    ],
  });

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const resetToken = crypto.randomBytes(32).toString("hex");

  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  user.resetPasswordToken = hashedToken;
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  await user.save();

  res.json({
    message: "Reset token generated",
    resetToken,
  });
});

/* ================= RESET PASSWORD ================= */
const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const { password } = req.body;

  if (!token) {
    res.status(400);
    throw new Error("Reset token required");
  }

  if (!password || !String(password).trim()) {
    res.status(400);
    throw new Error("Password required");
  }

  const hashedToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: {
      $gt: Date.now(),
    },
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

/* ================= VERIFY PHONE ================= */
const verifyPhone = asyncHandler(async (req, res) => {
  const { userId, code } = req.body;

  if (!userId || !code) {
    res.status(400);
    throw new Error("userId and code required");
  }

  const hashed = crypto
    .createHash("sha256")
    .update(String(code))
    .digest("hex");

  const user = await User.findOne({
    _id: userId,
    phoneVerificationToken: hashed,
    phoneVerificationExpire: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    throw new Error("Invalid or expired verification code");
  }

  user.isVerified = true;
  user.phoneVerificationToken = undefined;
  user.phoneVerificationExpire = undefined;

  await user.save();

  // Issue auth token after verification
  const token = generateToken(user._id);

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    message: "Phone verified",
    token,
  });
});

/* ================= WELCOME ================= */
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

/* ================= UPDATE AVATAR ================= */
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
    const avatarUrl =
      req.file.path ||
      req.file.filename ||
      req.file.url;

    const user = await User.findById(userId);

    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    user.avatar = avatarUrl;

    await user.save();

    res.json({
      success: true,
      avatar: user.avatar,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Avatar update failed",
    });
  }
});

/* ================= GET ALL USERS (ADMIN ONLY) ================= */
const getAllUsers = asyncHandler(async (req, res) => {
  // check admin
  if (!req.user.isAdmin) {
    res.status(403);
    throw new Error("Admin access only");
  }

  const users = await User.find({})
    .select("_id name email phone avatar online isAdmin createdAt")
    .lean();

  const formattedUsers = users.map((u) => ({
    _id: u._id,
    name: u.name,
    email: u.email || null,
    phone: u.phone || null,
    avatar: u.avatar || null,
    status: u.online ? "online" : "offline",
    isAdmin: u.isAdmin,
    createdAt: u.createdAt,
  }));

  res.json({
    success: true,
    count: formattedUsers.length,
    users: formattedUsers,
  });
});

/* ================= SYNC CONTACTS ================= */
const syncContacts = asyncHandler(async (req, res) => {
  const { contacts } = req.body;

  if (!contacts || !contacts.length) {
    res.status(400);
    throw new Error("No contacts provided");
  }

  const users = await User.find({
    phoneHash: { $in: contacts },
    _id: { $ne: req.user._id },
  })
    .select("_id name avatar online phone")
    .lean();

  const formattedUsers = users.map((u) => ({
    _id: u._id,
    name: u.name,
    avatar: u.avatar || null,
    phone: u.phone,
    status: u.online ? "online" : "offline",
  }));

  res.json({
    success: true,
    users: formattedUsers,
  });
});

/* ================= SEARCH USERS ================= */
const searchUsers = asyncHandler(async (req, res) => {
  const q = req.query.q;

  if (!q) {
    return res.status(400).json({
      message: "Query required",
    });
  }

  const users = await User.find({
    name: {
      $regex: q,
      $options: "i",
    },
  })
    .select("_id name avatar online")
    .limit(20);

  res.json({
    success: true,
    users,
  });
});

/* ================= ADD CONTACT ================= */
const addContact = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    res.status(400);
    throw new Error("User ID required");
  }

  if (req.user._id.toString() === userId) {
    res.status(400);
    throw new Error("Cannot add yourself");
  }

  const user = await User.findById(req.user._id);

  const targetUser = await User.findById(userId);

  if (!targetUser) {
    res.status(404);
    throw new Error("User not found");
  }

  // prevent duplicates
  if (user.contacts.includes(userId)) {
    return res.json({
      success: true,
      message: "Already in contacts",
    });
  }

  user.contacts.push(userId);

  await user.save();

  res.json({
    success: true,
    message: "Contact added",
  });
});

/* ================= GET CONTACTS ================= */
const getContacts = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate("contacts", "_id name avatar online");

  const formattedUsers = user.contacts.map((u) => ({
    _id: u._id,
    name: u.name,
    avatar: u.avatar || null,
    status: u.online ? "online" : "offline",
  }));

  res.json({
    success: true,
    users: formattedUsers,
  });
});

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  verifyPhone,
  welcome,
  sendMood,
  generateToken,
  updateAvatar,
  sendMessage,
  getMessages,
  getAllUsers,
  syncContacts,
  searchUsers,
  getUserById,
  addContact,
  getContacts,
};
