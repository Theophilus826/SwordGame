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
      unique: true,
      sparse: true, // allows multiple nulls
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      unique: true,
      sparse: true, // allows multiple nulls
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
      default: false,
    },

    lastActive: {
      type: Date,
      default: Date.now,
    },

    // 🔐 Forgot Password
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  {
    timestamps: true,
  }
);


// ✅ Ensure at least email OR phone exists
userSchema.pre("validate", function (next) {
  if (!this.email && !this.phone) {
    return next(new Error("Either email or phone is required"));
  }
  next();
});


// ✅ Explicit indexes (safer for production)
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });


module.exports = mongoose.model("User", userSchema);
