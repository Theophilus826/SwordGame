const mongoose = require("mongoose");

const depositSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  accountNumber: { type: String, required: true },
  bankName: { type: String, required: true },
  accountName: { type: String, required: true },

  amount: { type: Number, default: 0 },

  method: { 
    type: String, 
    enum: ["ngn"], 
    default: "ngn" 
  },

  status: { 
    type: String, 
    enum: ["PENDING", "COMPLETED", "FAILED"], 
    default: "PENDING" 
  },

  reference: { type: String, required: true, unique: true },
  paymentReference: { type: String },

}, { timestamps: true });

module.exports = mongoose.model("Deposit", depositSchema);
