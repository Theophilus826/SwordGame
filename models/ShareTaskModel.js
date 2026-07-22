const mongoose = require("mongoose");

const UserShareTaskSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShareTask",
      required: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    recipients: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },

        messageId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Message",
          default: null,
        },

        sentAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // NEW
    messageCount: {
      type: Number,
      default: 0,
    },

    // NEW
    completed: {
      type: Boolean,
      default: false,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    // NEW
    rewarded: {
      type: Boolean,
      default: false,
    },

    rewardedAt: {
      type: Date,
      default: null,
    },

    rewardedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rejectionReason: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "pending",
        "completed",
        "rewarded",
        "rejected",
      ],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

UserShareTaskSchema.index(
  {
    task: 1,
    user: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "UserShareTask",
  UserShareTaskSchema
);
