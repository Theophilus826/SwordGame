const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/UserModels");

const hashSecret = (secret) =>
  crypto.createHash("sha256").update(secret).digest("hex");

const issueSession = (res, user) => {
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return token;
};

const enrollBiometrics = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const biometricSecret = crypto.randomBytes(32).toString("hex");
  user.biometricSecretHash = hashSecret(biometricSecret);
  await user.save();

  res.json({
    userId: user._id.toString(),
    biometricSecret,
  });
});

const removeBiometrics = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  user.biometricSecretHash = undefined;
  await user.save();

  res.json({ success: true });
});

const loginWithBiometrics = asyncHandler(async (req, res) => {
  const { userId, biometricSecret } = req.body;

  if (
    typeof userId !== "string" ||
    !mongoose.isValidObjectId(userId) ||
    typeof biometricSecret !== "string" ||
    !/^[a-f\d]{64}$/i.test(biometricSecret)
  ) {
    res.status(401);
    throw new Error("Invalid biometric credentials");
  }

  const user = await User.findById(userId).select("+biometricSecretHash");
  const storedHash = user?.biometricSecretHash;

  if (!user || !/^[a-f\d]{64}$/i.test(storedHash || "")) {
    res.status(401);
    throw new Error("Invalid biometric credentials");
  }

  const submittedHash = Buffer.from(hashSecret(biometricSecret), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");

  if (!crypto.timingSafeEqual(submittedHash, expectedHash)) {
    res.status(401);
    throw new Error("Invalid biometric credentials");
  }

  user.online = true;
  user.lastActive = Date.now();
  await user.save();

  const token = issueSession(res, user);

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

module.exports = {
  enrollBiometrics,
  removeBiometrics,
  loginWithBiometrics,
};
