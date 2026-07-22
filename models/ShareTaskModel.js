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

    // Every successful share
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

        messagedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

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

    completedAt: Date,

    rewardedAt: Date,

    rewardedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rejectionReason: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
  }
);

// One record per user per task
UserShareTaskSchema.index(
  {
    task: 1,
    user: 1,
  },
  {
    unique: true,
  }
);

// Number of valid shares
UserShareTaskSchema.virtual("messageCount").get(function () {
  return this.recipients.length;
});

module.exports = mongoose.model(
  "UserShareTask",
  UserShareTaskSchema
);
