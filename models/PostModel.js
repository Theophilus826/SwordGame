const mongoose = require("mongoose");

// ================= COMMENTS =================
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

// ================= MEDIA =================
const mediaSchema = new mongoose.Schema({
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

// ================= POST =================
const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    text: {
      type: String,
      trim: true,
      default: "",
    },

    media: [mediaSchema],

    // ✅ Reactions (source of truth)
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

    // ✅ Stored counts (auto-managed)
    likeCount: {
      type: Number,
      default: 0,
    },
    loveCount: {
      type: Number,
      default: 0,
    },

    comments: [commentSchema],
  },
  { timestamps: true }
);

// ================= PRE-SAVE MIDDLEWARE =================
postSchema.pre("save", function (next) {
  // ensure arrays exist
  this.likedBy = this.likedBy || [];
  this.lovedBy = this.lovedBy || [];

  // sync counts
  this.likeCount = this.likedBy.length;
  this.loveCount = this.lovedBy.length;

  next();
});

module.exports = mongoose.model("Post", postSchema);
