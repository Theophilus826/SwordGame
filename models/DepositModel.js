const mongoose = require("mongoose");

const depositSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // =========================
    // ACCOUNT DETAILS
    // =========================
    accountNumber: { type: String },
    bankName: { type: String },
    accountName: { type: String },

    // =========================
    // AMOUNTS
    // =========================
    amount: {
      type: Number,
      default: 0, // actual paid amount
    },

    expectedAmount: {
      type: Number,
      required: true, // what user was told to pay
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
    // STATUS TRACKING
    // =========================
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "PENDING",
    },

    receipt: {
      type: String,
    },

    reviewStatus: {
      type: String,
      enum: ["NONE", "PENDING_REVIEW", "APPROVED", "REJECTED"],
      default: "NONE",
    },

    rejectionReason: { type: String },

    // =========================
    // REFERENCES
    // =========================
    reference: {
      type: String,
      unique: true,
    },

    transactionReference: {
      type: String, // user-provided or gateway reference
    },

    // =========================
    // RECEIPT (MANUAL FLOW)
    // =========================
    receipt: {
      type: String, // file path / URL
    },

    // =========================
    // PAYMENT DATA (WEBHOOK LOG)
    // =========================
    paymentData: {
      type: Object, // store full webhook payload
    },

    // =========================
    // TIMING CONTROL
    // =========================
    expiresAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Deposit", depositSchema);
