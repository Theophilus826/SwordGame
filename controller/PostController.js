const asyncHandler = require("express-async-handler");

const Post = require("../models/PostModel");
const cloudinary = require("../config/Cloudinary");

// ✅ NEW (centralized notifications)
const { notifyPostReaction } = require("../config/NotificationService");

/* =========================
   CREATE POST
========================= */

const createPost = asyncHandler(async (req, res) => {
  const text = req.body.text?.trim() || "";
  const media = [];

  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      const isVideo = file.mimetype.startsWith("video");

      const result = await cloudinary.uploader.upload(file.path, {
        folder: "posts",
        resource_type: isVideo ? "video" : "image",
        public_id: `${Date.now()}-${file.originalname}`,
      });

      media.push({
        url: result.secure_url,
        type: isVideo ? "video" : "image",
      });
    }
  }

  if (!text && media.length === 0) {
    res.status(400);
    throw new Error("Post must contain text or media");
  }

  const post = await Post.create({
    user: req.user._id,
    text,
    media,
  });

  const populatedPost = await Post.findById(post._id)
    .populate("user", "name avatar")
    .populate("comments.user", "name avatar")
    .lean();

  res.status(201).json({
    success: true,
    message: "Post created",
    post: populatedPost,
  });
});

/* =========================
   UPLOAD MEDIA
========================= */
const uploadMedia = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.postId);

  if (!post) {
    res.status(404);
    throw new Error("Post not found");
  }

  if (post.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error("Not authorized");
  }

  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error("No files uploaded");
  }

  post.media = Array.isArray(post.media) ? post.media : [];

  for (const file of req.files) {
    const isVideo = file.mimetype.startsWith("video");

    const result = await cloudinary.uploader.upload(file.path, {
      folder: "posts",
      resource_type: isVideo ? "video" : "image",
      public_id: `${Date.now()}-${file.originalname}`,
    });

    post.media.push({
      url: result.secure_url,
      type: isVideo ? "video" : "image",
    });
  }

  await post.save();

  const populatedPost = await Post.findById(post._id)
    .populate("user", "name avatar")
    .populate("comments.user", "name avatar")
    .lean();

  res.json({
    success: true,
    message: "Media uploaded",
    post: populatedPost,
  });
});

/* =========================
   GET POSTS
========================= */
const getPosts = asyncHandler(async (req, res) => {
  const posts = await Post.find()
    .sort({ createdAt: -1 })
    .populate("user", "name avatar")
    .populate("comments.user", "name avatar")
    .lean();

  res.json({
    success: true,
    count: posts.length,
    posts,
  });
});

/* =========================
   GET SINGLE POST
========================= */
const getPostById = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.postId)
    .populate("user", "name avatar")
    .populate("comments.user", "name avatar")
    .lean();

  if (!post) {
    res.status(404);
    throw new Error("Post not found");
  }

  res.json({ success: true, post });
});

/* =========================
   REACT TO POST
========================= */
const reactPost = async (req, res) => {
  try {
    const { type } = req.body;

    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    const userId = req.user._id.toString();

    post.likedBy = post.likedBy || [];
    post.lovedBy = post.lovedBy || [];

    let userReaction = null;

    /* ================= LIKE ================= */
    if (type === "like") {
      const hasLiked = post.likedBy.includes(userId);

      if (hasLiked) {
        post.likedBy = post.likedBy.filter((id) => id !== userId);
      } else {
        post.likedBy.push(userId);

        // optional: remove love if switching
        post.lovedBy = post.lovedBy.filter((id) => id !== userId);
      }
    }

    /* ================= LOVE ================= */
    if (type === "love") {
      const hasLoved = post.lovedBy.includes(userId);

      if (hasLoved) {
        post.lovedBy = post.lovedBy.filter((id) => id !== userId);
      } else {
        post.lovedBy.push(userId);

        // optional: remove like if switching
        post.likedBy = post.likedBy.filter((id) => id !== userId);
      }
    }

    await post.save();

    /* ================= DETECT USER STATE ================= */
    if (post.likedBy.includes(userId)) userReaction = "like";
    if (post.lovedBy.includes(userId)) userReaction = "love";

    return res.json({
      success: true,

      likedBy: post.likedBy,
      lovedBy: post.lovedBy,

      likeCount: post.likedBy.length,
      loveCount: post.lovedBy.length,

      userReaction,
    });
  } catch (err) {
    console.error("ReactPost Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
/* =========================
   COMMENT POST
========================= */
const commentPost = asyncHandler(async (req, res) => {
  const text = req.body.text?.trim();

  if (!text) {
    res.status(400);
    throw new Error("Comment cannot be empty");
  }

  const post = await Post.findById(req.params.postId);

  if (!post) {
    res.status(404);
    throw new Error("Post not found");
  }

  post.comments = Array.isArray(post.comments) ? post.comments : [];
  post.comments.push({ user: req.user._id, text });

  await post.save();

  const updatedPost = await Post.findById(post._id)
    .populate("comments.user", "name avatar")
    .lean();

  res.json({
    success: true,
    comments: updatedPost.comments,
  });
});

module.exports = {
  createPost,
  uploadMedia,
  getPosts,
  getPostById,
  reactPost,
  commentPost,
};
