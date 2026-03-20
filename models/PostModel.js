const mongoose = require("mongoose");

// ===== Comment Schema =====
const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

// ===== Media Schema =====
const mediaSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["image", "video"],
    default: ["image", "video"],
  },
});

// ===== Post Schema =====
const postSchema = new mongoose.Schema(
  {
    // Post owner
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Post content
    text: {
      type: String,
      trim: true,
      default: "",
    },

    // Media attachments
    media: [mediaSchema],

    // Reactions
    likeCount: {
      type: Number,
      default: 0,
    },
    loveCount: {
      type: Number,
      default: 0,
    },
    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    lovedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Comments
    comments: [commentSchema],
  },
  { timestamps: true }
);

// ===== Export Post Model =====
module.exports = mongoose.model("Post", postSchema);
