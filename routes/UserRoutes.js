const express = require("express");
const router = express.Router();

const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/Cloudinary");

const Post = require("../models/PostModel");

const {
  registerUser,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  welcome,
  sendMood,
  updateAvatar,
  sendMessage,
  getMessages,
  getAllUsers,
  syncContacts,
  searchUsers,
  getUserById,
} = require("../controller/UserController");

const { protect } = require("../middleware/AuthMiddleware");

/* =========================
   MULTER / CLOUDINARY
========================= */

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "avatars",
    resource_type: "image",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage });

/* =========================
   PUBLIC AUTH
========================= */

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.post("/forgot-password", forgotPassword);
router.put("/reset-password/:token", resetPassword);

/* =========================
   PROTECTED
========================= */

router.get("/welcome", protect, welcome);
router.post("/mood", protect, sendMood);
router.post("/sync-contacts", protect, syncContacts);

/* =========================
   USERS
========================= */

router.get("/", protect, getAllUsers);
router.get("/search", protect, searchUsers);

/* ⚠️ IMPORTANT: keep dynamic routes LAST */
router.get("/:userId", protect, getUserById);

router.put(
  "/:userId/avatar",
  protect,
  upload.single("file"),
  updateAvatar
);

/* =========================
   POSTS
========================= */

router.get("/:userId/posts", protect, async (req, res) => {
  try {
    const posts = await Post.find({ user: req.params.userId })
      .sort({ createdAt: -1 })
      .populate("user", "name avatar")
      .lean();

    res.json({
      success: true,
      count: posts.length,
      posts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user posts",
    });
  }
});

/* =========================
   CHAT
========================= */

router.post("/chat/send", protect, sendMessage);

// ⚠️ FIXED ROUTE NAME (CLEARER)
router.get("/chat/messages/:otherUserId", protect, getMessages);

module.exports = router;
