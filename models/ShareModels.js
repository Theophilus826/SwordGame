const mongoose = require("mongoose");

/* =======================
   Referral Model
======================= */
const referralSchema = mongoose.Schema(
  {
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    referredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rewarded: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

/* =======================
   Admin Settings Model
======================= */
const adminSettingsSchema = mongoose.Schema(
  {
    referralsRequired: {
      type: Number,
      default: 5,
      min: 1,
    },
    rewardCoins: {
      type: Number,
      default: 10,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

const Referral = mongoose.model("Referral", referralSchema);
const AdminSettings = mongoose.model("AdminSettings", adminSettingsSchema);

module.exports = {
  Referral,
  AdminSettings,
};
