const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/UserModels");

/* =========================
   EXTRACT TOKEN (CLEAN)
========================= */
const getTokenFromRequest = (req) => {
  // 1️⃣ Cookie
  if (req.cookies?.token) {
    return req.cookies.token;
  }

  // 2️⃣ Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    return req.headers.authorization.split(" ")[1];
  }

  // 3️⃣ ✅ SSE support (query param)
  if (req.query?.token) {
    return req.query.token;
  }

  return null;
};

/* =========================
   AUTH MIDDLEWARE
========================= */
const protect = asyncHandler(async (req, res, next) => {
  const token = getTokenFromRequest(req);

  // ❌ No token
  if (!token) {
    return res.status(401).json({
      message: "Not authorized, no token",
    });
  }

  try {
    // ✅ Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Support both formats
    const userId = decoded.id || decoded._id;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid token payload",
      });
    }

    // ✅ Fetch user
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    // ✅ Attach user
    req.user = user;

    // 🔍 Optional debug (remove in production)
    if (process.env.NODE_ENV !== "production") {
      console.log("✅ AUTH USER:", user._id.toString());
    }

    next();
  } catch (error) {
    console.error("❌ AUTH ERROR:", error.message);

    return res.status(401).json({
      message: "Token failed",
    });
  }
});

/* =========================
   ADMIN MIDDLEWARE
========================= */
const admin = (req, res, next) => {
  if (req.user?.isAdmin) {
    return next();
  }

  return res.status(403).json({
    message: "Admin access only",
  });
};

module.exports = { protect, admin };
