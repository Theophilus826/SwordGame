
const mongoose = require("mongoose");

const tournamentPaymentSchema = new mongoose.Schema(
  {
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },

    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TournamentTeam",
      required: true,
      index: true,
    },

    payer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    currency: {
      type: String,
      enum: ["NGN"],
      default: "NGN",
    },

    paymentMethod: {
      type: String,
      enum: [
        "bank_transfer",
        "paystack",
        "cash",
        "other",
      ],
      required: true,
    },

    transactionReference: {
      type: String,
      trim: true,
      default: null,
    },

    proofOfPayment: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "pending",
        "verified",
        "rejected",
        "refunded",
      ],
      default: "pending",
      index: true,
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

// Avoid duplicate payment references when a reference is supplied.
tournamentPaymentSchema.index(
  { transactionReference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      transactionReference: { $type: "string" },
    },
  }
);

tournamentPaymentSchema.index({
  tournament: 1,
  status: 1,
  createdAt: -1,
});

module.exports = mongoose.model(
  "TournamentPayment",
  tournamentPaymentSchema
);
