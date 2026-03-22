const asyncHandler = require("express-async-handler");
const Post = require("../models/PostModel");
const cloudinary = require("../config/Cloudinary"); // your cloudinary config

// =========================
// Create Post
// =========================
const createPost = asyncHandler(async (req, res) => {
  const text = req.body.text?.trim() || "";
  const media = [];

  if (req.file) {
    // Upload file to Cloudinary
    const isVideo = req.file.mimetype.startsWith("video");
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "posts",
      resource_type: isVideo ? "video" : "image",
      public_id: `${Date.now()}-${req.file.originalname}`,
       quality: "auto",
       fetch_format: "auto",
    });

    media.push({ url: result.secure_url, type: isVideo ? "video" : "image" });
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
// Upload Media to Existing Post
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

  // Upload to Cloudinary
  const isVideo = req.file.mimetype.startsWith("video");
  const result = await cloudinary.uploader.upload(req.file.path, {
    folder: "posts",
    resource_type: isVideo ? "video" : "image",
    public_id: `${Date.now()}-${req.file.originalname}`,
  });

  // Ensure post.media is array
  post.media = Array.isArray(post.media) ? post.media : [];
  post.media.push({ url: result.secure_url, type: isVideo ? "video" : "image" });

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
  post.likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
  post.lovedBy = Array.isArray(post.lovedBy) ? post.lovedBy : [];

  if (type === "like") {
    const index = post.likedBy.indexOf(userId);
    if (index > -1) post.likedBy.splice(index, 1);
    else {
      post.likedBy.push(userId);
      post.lovedBy = post.lovedBy.filter((id) => id.toString() !== userId);
    }
  } else {
    const index = post.lovedBy.indexOf(userId);
    if (index > -1) post.lovedBy.splice(index, 1);
    else {
      post.lovedBy.push(userId);
      post.likedBy = post.likedBy.filter((id) => id.toString() !== userId);
    }
  }

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
  reactPost,
  commentPost,
  getPostById,
};
