const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/UserModels");

/* =========================
   EXTRACT TOKEN
========================= */

const getTokenFromRequest = (req) => {
  // Cookie
  if (req.cookies?.token) {
    return req.cookies.token;
  }

  // Authorization: Bearer xxx
  const auth = req.headers.authorization;

  if (auth?.startsWith("Bearer ")) {
    return auth.substring(7).trim();
  }

  // SSE/EventSource
  if (req.query?.token) {
    return req.query.token;
  }

  return null;
};

/* =========================
   AUTH
========================= */

const protect = asyncHandler(async (req, res, next) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. No token.",
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const userId =
      decoded.id ||
      decoded._id ||
      decoded.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload.",
      });
    }

    const user = await User.findById(userId)
      .select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found.",
      });
    }

    req.user = user;

    if (process.env.NODE_ENV !== "production") {
      console.log(
        "Authenticated:",
        user._id.toString()
      );
    }

    next();
  } catch (err) {
    console.error("AUTH ERROR:", err.message);

    return res.status(401).json({
      success: false,
      message: "Token failed.",
    });
  }
});

/* =========================
   ADMIN
========================= */

const admin = (req, res, next) => {
  if (req.user?.isAdmin) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Admin access only.",
  });
};

module.exports = {
  protect,
  admin,
};
