const mongoose = require("mongoose");

const depositSchema = new mongoose.Schema(
  {
    // =========================
    // USER
    // =========================
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // =========================
    // ACCOUNT DETAILS
    // =========================
    accountNumber: {
      type: String,
      default: null,
    },

    bankName: {
      type: String,
      default: null,
    },

    accountName: {
      type: String,
      default: null,
    },

    // =========================
    // AMOUNTS
    // =========================
    amount: {
      type: Number,
      default: 0,
    },

    expectedAmount: {
      type: Number,
      required: true,
    },

    // =========================
    // PAYMENT METHOD
    // =========================
    method: {
      type: String,
      enum: ["ngn", "opay", "palmpay"],
      required: true,
      index: true,
    },

    provider: {
      type: String,
      enum: ["monnify", "opay", "palmpay"],
      default: "monnify",
    },

    // =========================
    // STATUS
    // =========================
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "PENDING",
      index: true,
    },

    reviewStatus: {
      type: String,
      enum: ["NONE", "PENDING_REVIEW", "APPROVED", "REJECTED"],
      default: "NONE",
      index: true,
    },

    // =========================
    // RECEIPT
    // =========================
    receipt: {
      type: String,
      default: null,
      trim: true,
    },

    // =========================
    // READ STATUS (ADMIN INBOX)
    // =========================
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    // =========================
    // ADMIN TRACKING
    // =========================
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rejectionReason: {
      type: String,
      default: null,
    },

    // =========================
    // REFERENCES
    // =========================
    reference: {
      type: String,
      unique: true,
      index: true,
    },

    transactionReference: {
      type: String,
      default: null,
    },

    // =========================
    // PAYMENT WEBHOOK DATA
    // =========================
    paymentData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // =========================
    // EXPIRY
    // =========================
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// =========================
// VIRTUAL: HAS RECEIPT
// =========================
depositSchema.virtual("hasReceipt").get(function () {
  return Boolean(this.receipt);
});

// Enable virtuals in API responses
depositSchema.set("toJSON", { virtuals: true });
depositSchema.set("toObject", { virtuals: true });

// =========================
// HELPER METHOD
// =========================
depositSchema.methods.isExpired = function () {
  return this.expiresAt && new Date() > this.expiresAt;
};

module.exports = mongoose.model("Deposit", depositSchema);
