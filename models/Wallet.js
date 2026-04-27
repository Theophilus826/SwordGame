const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    balance: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: "NGN",
    },

    totalDeposited: {
      type: Number,
      default: 0,
    },

    totalWithdrawn: {
      type: Number,
      default: 0,
    },

    lockedBalance: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "BLOCKED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

/**
 * 🔥 Auto-create wallet if missing
 */
walletSchema.statics.findOrCreate = async function (userId) {
  let wallet = await this.findOne({ user: userId });

  if (!wallet) {
    wallet = await this.create({
      user: userId,
      balance: 0,
    });
  }

  return wallet;
};

module.exports = mongoose.model("Wallet", walletSchema);
