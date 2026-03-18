const express = require("express");
const router = express.Router();

const {
  registerUser,
  loginUser,
  logoutUser, // ✅ added
  forgotPassword,
  resetPassword,
  welcome,
} = require("../controller/UserController");

const Post = require("../models/PostModel"); // ✅ fixed path
const { protect } = require("../middleware/AuthMiddleware");

// ==========================
// PUBLIC AUTH ROUTES
// ==========================
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser); // ✅ added
router.post("/forgot-password", forgotPassword);
router.put("/reset-password/:token", resetPassword);

// ==========================
// PROTECTED ROUTES
// ==========================

// Welcome route
router.get("/welcome", protect, welcome);

// ==========================
// GET USER POSTS
// ==========================
router.get("/:userId/posts", protect, async (req, res) => {
  const { userId } = req.params;

  // ✅ Authorization check
  if (req.user._id.toString() !== userId && !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: Access denied",
    });
  }

  try {
    const posts = await Post.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("user", "name avatar") // ✅ better UX
      .lean();

    res.status(200).json({
      success: true,
      count: posts.length,
      posts,
    });
  } catch (err) {
    console.error("Error fetching user posts:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user posts",
    });
  }
});

module.exports = router;
