// models/Deposit.js
const mongoose = require("mongoose");

const depositSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    accountNumber: { type: String, required: true },
    bankName: { type: String, required: true },
    accountName: { type: String, required: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ["ngn", "paga", "palmpay"], required: true },
    status: { type: String, enum: ["PENDING", "COMPLETED", "FAILED"], default: "PENDING" },
    reference: { type: String }, // optional for verification
}, { timestamps: true });

module.exports = mongoose.model("Deposit", depositSchema);
