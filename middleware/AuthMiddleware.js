const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/UserModels");

/* =========================
   AUTH MIDDLEWARE
========================= */
const protect = asyncHandler(async (req, res, next) => {
  let token;

  // 1️⃣ Get token from cookies
  if (req.cookies?.token) {
    token = req.cookies.token;
  }

  // 2️⃣ Get token from Authorization header
  if (
    !token &&
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // ❌ No token
  if (!token) {
    return res.status(401).json({
      message: "Not authorized, no token",
    });
  }

  try {
    // ✅ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Support both id and _id (VERY IMPORTANT FIX)
    const userId = decoded.id || decoded._id;

    if (!userId) {
      return res.status(401).json({
        message: "Invalid token payload",
      });
    }

    // ✅ Get user from DB
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    // ✅ Attach user to request
    req.user = user;

    // 🔍 Debug (can remove later)
    console.log("✅ AUTH USER:", user._id);

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
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    return res.status(403).json({
      message: "Admin access only",
    });
  }
};

module.exports = { protect, admin };
