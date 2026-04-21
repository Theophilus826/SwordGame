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
      sparse: true, // ✅ IMPORTANT for optional email
      lowercase: true,
      trim: true,
      default: undefined,
    },

    phone: {
      type: String,
      unique: true,
      sparse: true, // ✅ IMPORTANT for optional phone
      trim: true,
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

    isAdmin: {
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

    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
  }
);

// ✅ Keep only ONE way of indexing
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("User", userSchema);
