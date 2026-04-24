const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

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

    password: { type: String, required: true },

    coins: { type: Number, default: 0, min: 0 },

    avatar: { type: String, default: null },

    isAdmin: { type: Boolean, default: false },

    online: { type: Boolean, default: false },

    lastActive: { type: Date, default: Date.now },

    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.User || mongoose.model("User", userSchema);
