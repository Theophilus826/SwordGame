const mongoose = require("mongoose");

const ShareTaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    image: {
      type: String,
      default: "",
    },

    // Type of task
    type: {
      type: String,
      enum: [
        "message_users",
        "share_post",
        "share_receipt",
        "invite_users",
      ],
      default: "message_users",
    },

    // Optional item being shared
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    targetModel: {
      type: String,
      default: "",
    },

    rewardCoins: {
      type: Number,
      default: 100,
      min: 1,
    },

    requiredMessages: {
      type: Number,
      default: 10,
      min: 1,
    },

    // Optional keyword users must send
    requiredKeyword: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "draft",
        "active",
        "ended",
      ],
      default: "active",
    },

    autoReward: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    expiresAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "ShareTask",
  ShareTaskSchema
);
