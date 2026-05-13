const mongoose = require("mongoose");

const groupMessageSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },

    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    text: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: "",
    },

    /* ✅ FILES */
    image: {
      type: String,
      default: null,
    },

    video: {
      type: String,
      default: null,
    },

    audio: {
      type: String,
      default: null,
    },

    file: {
      type: String,
      default: null,
    },

    /* 🔥 REWARD TRACKING */
    rewardGiven: {
      type: Boolean,
      default: false,
    },

    rewardCoins: {
      type: Number,
      default: 0,
    },

    xpEarned: {
      type: Number,
      default: 0,
    },

    /* 🔥 MESSAGE METRICS */
    reactionsCount: {
      type: Number,
      default: 0,
    },

    repliesCount: {
      type: Number,
      default: 0,
    },

    sharesCount: {
      type: Number,
      default: 0,
    },

    /* 🔥 SPAM DETECTION */
    spamScore: {
      type: Number,
      default: 0,
    },

    flaggedAsSpam: {
      type: Boolean,
      default: false,
    },

    /* ✅ SYSTEM EVENTS */
    isSystemMessage: {
      type: Boolean,
      default: false,
    },

    systemType: {
      type: String,
      default: null,
    },

    /* ✅ READ BY */
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },

        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    /* ✅ EDIT */
    edited: {
      type: Boolean,
      default: false,
    },

    editedAt: {
      type: Date,
      default: null,
    },

    /* ✅ DELETE */
    deletedForEveryone: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

/* ================= INDEXES ================= */

groupMessageSchema.index({
  group: 1,
  createdAt: -1,
});

groupMessageSchema.index({
  fromUser: 1,
  createdAt: -1,
});

groupMessageSchema.index({
  rewardGiven: 1,
});

groupMessageSchema.index({
  flaggedAsSpam: 1,
});

/* ================= EXPORT ================= */

module.exports = mongoose.model(
  "GroupMessages",
  groupMessageSchema,
);
