const Post = require("../models/PostModel");

// =========================
// Create Post (text + optional media)
// =========================
const createPost = async (req, res) => {
  try {
    const text = req.body.text?.trim() || "";
    const media = [];

    if (req.file) {
      const type = req.file.mimetype.startsWith("video") ? "video" : "image";
      media.push({ url: `/uploads/${req.file.filename}`, type });
    }

    if (!text && media.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Post must contain text or media",
      });
    }

    const post = await Post.create({
      user: req.user._id,
      text,
      media,
    });

    // Populate user info and select important fields
    const populatedPost = await Post.findById(post._id)
      .populate("user", "name avatar")
      .populate("comments.user", "name avatar")
      .select("text media user comments createdAt likeCount loveCount");

    res.status(201).json({
      success: true,
      message: "Post created",
      post: populatedPost,
    });
  } catch (err) {
    console.error("CreatePost Error:", err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================
// Upload media to existing post
// =========================
const uploadMedia = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    if (post.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const type = req.file.mimetype.startsWith("video") ? "video" : "image";
    const mediaItem = { url: `/uploads/${req.file.filename}`, type };

    post.media.push(mediaItem);
    await post.save();

    // Populate user info and select important fields (ensure text is included)
    const populatedPost = await Post.findById(post._id)
      .populate("user", "name avatar")
      .populate("comments.user", "name avatar")
      .select("text media user comments createdAt likeCount loveCount");

    res.json({
      success: true,
      message: "Media uploaded",
      media: [mediaItem],
      post: populatedPost, // full post including text
    });
  } catch (err) {
    console.error("UploadMedia Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// =========================
// Get all posts
// =========================
const getPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate("user", "name avatar")
      .populate("comments.user", "name avatar");

    res.json({ success: true, posts });
  } catch (err) {
    console.error("GetPosts Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// =========================
// React to post
// =========================
const reactPost = async (req, res) => {
  try {
    const { type } = req.body;
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const userId = req.user._id.toString();

    if (type === "like") {
      const index = post.likedBy.indexOf(userId);
      index > -1 ? (post.likedBy.splice(index, 1), post.likeCount--) : (post.likedBy.push(userId), post.likeCount++);
    }

    if (type === "love") {
      const index = post.lovedBy.indexOf(userId);
      index > -1 ? (post.lovedBy.splice(index, 1), post.loveCount--) : (post.lovedBy.push(userId), post.loveCount++);
    }

    await post.save();

    res.json({ success: true, likeCount: post.likeCount, loveCount: post.loveCount });
  } catch (err) {
    console.error("ReactPost Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// =========================
// Comment on post
// =========================
const commentPost = async (req, res) => {
  try {
    const text = req.body.text?.trim();
    if (!text) return res.status(400).json({ success: false, message: "Comment cannot be empty" });

    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    post.comments.push({ user: req.user._id, text });
    await post.save();

    const updatedPost = await Post.findById(post._id).populate("comments.user", "name avatar");
    res.json({ success: true, comments: updatedPost.comments });
  } catch (err) {
    console.error("CommentPost Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  createPost,
  uploadMedia,
  getPosts,
  reactPost,
  commentPost,
};
