const asyncHandler = require("express-async-handler");
const Post = require("../models/PostModel");

// =========================
// Create Post
// =========================
const createPost = asyncHandler(async (req, res) => {
  const text = req.body.text?.trim() || "";
  const media = [];

  if (req.file) {
    // Determine media type safely
    const type =
      req.body.type && ["image", "video"].includes(req.body.type)
        ? req.body.type
        : req.file.mimetype.startsWith("video")
        ? "video"
        : "image";

    media.push({ url: `/uploads/${req.file.filename}`, type });
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

  if (req.io) req.io.emit("post:created", populatedPost);

  res.status(201).json({
    success: true,
    message: "Post created",
    post: populatedPost,
  });
});

// =========================
// Upload Media
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

  if (!req.file) {
    res.status(400);
    throw new Error("No file uploaded");
  }

  // Ensure post.media is an array
  post.media = Array.isArray(post.media) ? post.media : [];

  // Safe type determination
  const type =
    req.body.type && ["image", "video"].includes(req.body.type)
      ? req.body.type
      : req.file.mimetype.startsWith("video")
      ? "video"
      : "image";

  const mediaItem = { url: `/uploads/${req.file.filename}`, type };
  post.media.push(mediaItem);

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
// React to Post
// =========================
const reactPost = asyncHandler(async (req, res) => {
  const { type } = req.body;
  if (!["like", "love"].includes(type)) {
    res.status(400);
    throw new Error("Invalid reaction type");
  }

  const post = await Post.findById(req.params.postId);
  if (!post) {
    res.status(404);
    throw new Error("Post not found");
  }

  const userId = req.user._id.toString();

  // Ensure reaction arrays exist
  post.likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
  post.lovedBy = Array.isArray(post.lovedBy) ? post.lovedBy : [];

  if (type === "like") {
    const index = post.likedBy.indexOf(userId);
    if (index > -1) post.likedBy.splice(index, 1);
    else {
      post.likedBy.push(userId);
      post.lovedBy = post.lovedBy.filter(id => id.toString() !== userId);
    }
  } else if (type === "love") {
    const index = post.lovedBy.indexOf(userId);
    if (index > -1) post.lovedBy.splice(index, 1);
    else {
      post.lovedBy.push(userId);
      post.likedBy = post.likedBy.filter(id => id.toString() !== userId);
    }
  }

  // Recalculate counts
  post.likeCount = post.likedBy.length;
  post.loveCount = post.lovedBy.length;

  await post.save();

  res.json({
    success: true,
    likeCount: post.likeCount,
    loveCount: post.loveCount,
  });
});

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
  post.comments.push({
    user: req.user._id,
    text,
  });

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
  reactPost,
  commentPost,
};
