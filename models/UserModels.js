const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      default: undefined,
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      default: undefined,
    },

    // Used for syncing contacts
    phoneHash: {
      type: String,
      unique: true,
      sparse: true,
      default: undefined,
    },

    password: {
      type: String,
      required: true,
    },

    coins: {
      type: Number,
      default: 0,
      min: 0,
    },

    avatar: {
      type: String,
      default: null,
    },

    isAdmin: {
      type: Boolean,
      default: false,
    },

    // Phone verification status
    isVerified: {
      type: Boolean,
      default: false,
    },

    online: {
      type: Boolean,
      default: false,
    },

    lastActive: {
      type: Date,
      default: Date.now,
    },

    contacts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    fcmToken: {
      type: String,
      default: null,
    },

    resetPasswordToken: {
      type: String,
      default: null,
    },

    resetPasswordExpire: {
      type: Date,
      default: null,
    },

    phoneVerificationToken: {
      type: String,
      default: null,
    },

    phoneVerificationExpire: {
      type: Date,
      default: null,
    },
    // For future use
    referralCode: {
      type: String,
      unique: true,
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
