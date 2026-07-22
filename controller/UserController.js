const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { formatPhone, hashPhone } = require("../config/phone");

const User = require("../models/UserModels");
const Message = require("../models/Message");
const { handleReferral } = require("./ShareControllers");
// or the correct relative path
const cloudinary = require("../config/Cloudinary");

/* ================= TOKEN ================= */
const generateToken = (id, expiresIn = "7d") => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn,
  });
};

/* ================= REGISTER ================= */
const registerUser = asyncHandler(async (req, res) => {
  let {
    name,
    email,
    phone,
    password,
    confirmPassword,
    referralCode, // referral code from signup form
  } = req.body;

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

  /* Generate unique referral code for this new user */
  let myReferralCode;
  let exists = true;

  while (exists) {
    myReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    exists = await User.findOne({
      referralCode: myReferralCode,
    });
  }

  const userData = {
    name,
    password: hashedPassword,
    isVerified: true,
    online: true,
    referralCode: myReferralCode,
  };

  if (email) userData.email = email;
  if (phone) userData.phone = phone;

  const user = await User.create(userData);

  /* Save referral if a referral code was supplied */
  if (referralCode) {
    await handleReferral(user._id, referralCode);
  }

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
    avatar: user.avatar || null,
    referralCode: user.referralCode,
    coins: user.coins,
    isAdmin: user.isAdmin,
    token,
    message: "Registration successful",
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

  const email = identifier.includes("@") ? identifier.toLowerCase() : null;

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

  const matched = await bcrypt.compare(password, user.password);

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
    req.io.to(toUserId.toString()).emit("receiveMessage", populatedMessage);

    req.io.to(req.user._id.toString()).emit("receiveMessage", populatedMessage);
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

  const user = await User.findById(userId).select(
    "_id name avatar online lastActive",
  );

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

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

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

  const hashed = crypto.createHash("sha256").update(String(code)).digest("hex");

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
    const avatarUrl = req.file.path || req.file.filename || req.file.url;

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
/* ================= GET ALL USERS (ADMIN ONLY) ================= */
const getAllUsers = asyncHandler(async (req, res) => {
  if (!req.user.isAdmin) {
    res.status(403);
    throw new Error("Admin access only");
  }

  const users = await User.find({})
    .select(
      `
      _id
      name
      email
      phone
      avatar
      online
      lastActive
      isAdmin
      isVerified
      coins
      mood
      referralCode
      createdAt
      updatedAt
      contacts
      `,
    )
    .populate("contacts", "_id name avatar phone online")
    .lean();

  res.status(200).json({
    success: true,
    count: users.length,
    users,
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
  const q = req.query.q?.trim();

  if (!q) {
    return res.status(400).json({
      message: "Query required",
    });
  }

  const formattedPhone = formatPhone(q);

  const searchConditions = [
    {
      name: {
        $regex: q,
        $options: "i",
      },
    },
  ];

  // If the query looks like a valid phone number,
  // search by phone too.
  if (formattedPhone) {
    searchConditions.push({
      phone: {
        $regex: formattedPhone,
        $options: "i",
      },
    });
  }

  const users = await User.find({
    $or: searchConditions,
  })
    .select("_id name avatar phone online")
    .limit(20);

  res.json({
    success: true,
    users,
  });
});

/* ================= ADD CONTACT ================= */
const addContact = asyncHandler(async (req, res) => {
  let { userId, phone } = req.body;

  if (!userId && !phone) {
    res.status(400);
    throw new Error("User ID or phone required");
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  let targetUser;

  if (userId) {
    targetUser = await User.findById(userId);
  } else {
    const formattedPhone = formatPhone(phone);

    if (!formattedPhone) {
      res.status(400);
      throw new Error("Invalid phone number");
    }

    targetUser = await User.findOne({
      phone: formattedPhone,
    });
  }

  if (!targetUser) {
    res.status(404);
    throw new Error("User not found");
  }

  if (req.user._id.equals(targetUser._id)) {
    res.status(400);
    throw new Error("Cannot add yourself");
  }

  // Prevent duplicates
  if (user.contacts.some((id) => id.equals(targetUser._id))) {
    return res.json({
      success: true,
      message: "Already in contacts",
    });
  }

  user.contacts.push(targetUser._id);
  await user.save();

  res.json({
    success: true,
    message: "Contact added",
    contact: {
      _id: targetUser._id,
      name: targetUser.name,
      phone: targetUser.phone,
      avatar: targetUser.avatar || null,
      status: targetUser.online ? "online" : "offline",
    },
  });
});

/* ================= GET CONTACTS ================= */
const getContacts = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate(
    "contacts",
    "_id name phone avatar online lastActive",
  );

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const formattedUsers = user.contacts.map((u) => ({
    _id: u._id,
    name: u.name,
    phone: u.phone || null,
    avatar: u.avatar || null,
    status: u.online ? "online" : "offline",
    lastActive: u.lastActive,
  }));

  res.json({
    success: true,
    count: formattedUsers.length,
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
