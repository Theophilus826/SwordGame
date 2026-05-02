const mongoose = require("mongoose");

// ===== Comment Schema =====
const commentSchema = new mongoose.Schema(
  {
    User: {
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
    default: "image",
  },
});

// ===== Post Schema =====
const postSchema = new mongoose.Schema(
  {
    // Post owner (FIXED: lowercase for consistency)
    User: {
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

    // Media
    media: [mediaSchema],

    // =========================
    // REACTIONS (SOURCE OF TRUTH)
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
  },
  { timestamps: true }
);

/* =========================
   VIRTUAL COUNTS (AUTO)
   ========================= */
postSchema.virtual("likeCount").get(function () {
  return this.likedBy?.length || 0;
});

postSchema.virtual("loveCount").get(function () {
  return this.lovedBy?.length || 0;
});

/* =========================
   ENABLE VIRTUALS IN JSON
   ========================= */
postSchema.set("toJSON", { virtuals: true });
postSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Post", postSchema);
