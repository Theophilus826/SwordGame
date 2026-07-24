const mongoose = require("mongoose");

const ShareTaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    assignedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    description: {
      type: String,
      required: true,
      trim: true,
    },

    image: {
      type: String,
      default: "",
    },

    type: {
      type: String,
      enum: ["message_users", "share_post", "share_receipt", "invite_users"],
      default: "message_users",
    },

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

    // NEW
    allowedTypes: {
      type: [
        {
          type: String,
          enum: ["text", "image", "voice"],
        },
      ],
      default: ["text"],
    },

    requiredKeyword: {
      type: String,
      default: "",
      trim: true,
    },

    // Keep both for backward compatibility
    active: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: ["draft", "active", "ended"],
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

    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("ShareTask", ShareTaskSchema);
