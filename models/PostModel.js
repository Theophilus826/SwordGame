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

    media: {
      type: [mediaSchema],
      default: [], // ✅ prevent undefined
    },

    // ✅ Reactions (always arrays)
    likedBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [], // ✅ critical fix
    },

    lovedBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [], // ✅ critical fix
    },

    // ✅ Stored counts
    likeCount: {
      type: Number,
      default: 0,
    },

    loveCount: {
      type: Number,
      default: 0,
    },

    comments: {
      type: [commentSchema],
      default: [], // ✅ prevent undefined
    },
  },
  { timestamps: true }
);

// ================= PRE-SAVE MIDDLEWARE =================
postSchema.pre("save", function (next) {
  try {
    // ✅ guarantee arrays (extra safety)
    if (!Array.isArray(this.likedBy)) this.likedBy = [];
    if (!Array.isArray(this.lovedBy)) this.lovedBy = [];

    // ✅ sync counts
    this.likeCount = this.likedBy.length;
    this.loveCount = this.lovedBy.length;

    next();
  } catch (err) {
    next(err); // ✅ prevents silent crash (fixes 500 issue)
  }
});

module.exports = mongoose.model("Post", postSchema);
