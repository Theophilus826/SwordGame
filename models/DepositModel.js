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
    accountNumber: String,
    bankName: String,
    accountName: String,

    // =========================
    // AMOUNTS
    // =========================
    amount: {
      type: Number,
      default: 0, // actual paid
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
    // RECEIPT (MANUAL FLOW)
    // =========================
    receipt: {
      type: String, // URL or file path
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    // =========================
    // ADMIN TRACKING
    // =========================
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    rejectionReason: String,

    // =========================
    // REFERENCES
    // =========================
    reference: {
      type: String,
      unique: true,
      index: true,
    },

    transactionReference: String,

    // =========================
    // PAYMENT DATA (WEBHOOK)
    // =========================
    paymentData: {
      type: Object,
    },

    // =========================
    // TIMING CONTROL
    // =========================
    expiresAt: {
      type: Date,
      index: true,
    },
  },
  { timestamps: true }
);

// =========================
// AUTO EXPIRE HELPER
// =========================
depositSchema.methods.isExpired = function () {
  return this.expiresAt && new Date() > this.expiresAt;
};

module.exports = mongoose.model("Deposit", depositSchema);
