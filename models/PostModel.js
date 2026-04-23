const mongoose = require("mongoose");

// Comment schema
const commentSchema = mongoose.Schema(
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

// Media schema
const mediaSchema = mongoose.Schema({
  url: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["image", "video"],
    default: "image",
  },
});

// Post schema
const postSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    text: {
      type: String,
      trim: true,
      default: "",
    },

    media: [mediaSchema],

    // =========================
    // REACTIONS (FIXED DESIGN)
    // =========================

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

    likeCount: {
      type: Number,
      default: 0,
    },

    loveCount: {
      type: Number,
      default: 0,
    },

    // Comments
    comments: [commentSchema],
  },
  { timestamps: true }
);

// =========================
// AUTO SYNC COUNTS BEFORE SAVE
// =========================
postSchema.pre("save", function (next) {
  this.likeCount = this.likedBy?.length || 0;
  this.loveCount = this.lovedBy?.length || 0;
  next();
});

module.exports = mongoose.model("Post", postSchema);
