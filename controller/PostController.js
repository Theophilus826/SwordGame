const asyncHandler = require("express-async-handler");
const Post = require("../models/PostModel");
const cloudinary = require("../config/Cloudinary"); // your cloudinary config
const Notification = require("../models/Notification");
const { pushNotification } = require("../config/sse");
// =========================
// Create Post (Multiple Files)
// =========================
const createPost = asyncHandler(async (req, res) => {
  const text = req.body.text?.trim() || "";
  const media = [];

  // Handle multiple files
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      const isVideo = file.mimetype.startsWith("video");
      const result = await cloudinary.uploader.upload(file.path, {
        folder: "posts",
        resource_type: isVideo ? "video" : "image",
        public_id: `${Date.now()}-${file.originalname}`,
      });
      media.push({ url: result.secure_url, type: isVideo ? "video" : "image" });
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

// =========================
// Upload Media to Existing Post (Multiple Files)
// =========================
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
    post.media.push({ url: result.secure_url, type: isVideo ? "video" : "image" });
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

// =========================
// Get All Posts
// =========================
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

// =========================
// Get Single Post
// =========================
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

// =========================
// React to Post (Like / Love)
// =========================
const reactPost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { postId } = req.params;
    const { type } = req.body; // like | love

    const post = await Post.findById(postId);

    const ownerId = post.userId;

    const result = await PostService.react(postId, userId, type);

    // ================= CREATE NOTIFICATION =================
    if (ownerId.toString() !== userId.toString()) {
      const notification = await Notification.create({
        userId: ownerId,
        fromUser: userId,
        type: type === "like" ? "like" : "love",
        message:
          type === "like"
            ? "👍 Someone liked your post"
            : "❤️ Someone loved your post",
        postId,
        read: false,
      });

      // ================= REALTIME PUSH =================
      pushNotification(ownerId.toString(), notification);
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Reaction failed" });
  }
};

// =========================
// Comment on Post
// =========================
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
