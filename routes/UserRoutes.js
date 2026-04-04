const express = require("express");
const router = express.Router();
const multer = require("multer");

const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/Cloudinary"); // ✅ FIXED

const {
  registerUser,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  welcome,
  sendMood,
  updateAvatar,
} = require("../controller/UserController");

const Post = require("../models/PostModel");
const { protect } = require("../middleware/AuthMiddleware");

// ==========================
// MULTER CONFIG (Cloudinary)
// ==========================
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "avatars",
    resource_type: "image",
    allowed_formats: ["jpg", "png", "jpeg", "webp"], // ✅ optional but good
  },
});

const upload = multer({ storage });

// ==========================
// PUBLIC AUTH ROUTES
// ==========================
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.post("/forgot-password", forgotPassword);
router.put("/reset-password/:token", resetPassword);

// ==========================
// PROTECTED ROUTES
// ==========================
router.get("/welcome", protect, welcome);
router.post("/mood", protect, sendMood);

// ==========================
// UPDATE AVATAR
// ==========================
router.put(
  "/:userId/avatar",
  protect,
  upload.single("file"),
  updateAvatar
);

// ==========================
// GET USER POSTS
// ==========================
router.get("/:userId/posts", protect, async (req, res) => {
  const { userId } = req.params;

  if (req.user._id.toString() !== userId && !req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: Access denied",
    });
  }

  try {
    const posts = await Post.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("user", "name avatar")
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
