const mongoose = require("mongoose");

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
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

    isAdmin: {
      type: Boolean,
      default: false,
    },

    online: {
      type: Boolean,
      default: false, // used for live online/offline tracking
    },

    lastActive: {
      type: Date,
      default: Date.now, // updated whenever user does something
    },

    // 🔐 Forgot Password
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true, // createdAt and updatedAt
  }
);

module.exports = mongoose.model("User", userSchema);
