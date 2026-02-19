const mongoose = require("mongoose");

const coinTransactionSchema = mongoose.Schema(
{
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },

    amount: {
        type: Number,
        required: true,   // +5, -10, +100
    },

    type: {
        type: String,
        enum: [
            "LOGIN",
            "ADMIN_CREDIT",
            "ADMIN_DEBIT",
            "PURCHASE",
            "REWARD",
            "REFUND"
        ],
        required: true,
    },

    description: {
        type: String,
    },

    // ✅ CRITICAL FOR EXPORTS / AUDIT
    balanceBefore: {
        type: Number,
        required: true,
    },

    balanceAfter: {
        type: Number,
        required: true,
    },

    // ✅ CRITICAL FOR ADMIN ACTIONS
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },

    // ✅ Optional but VERY useful
    referenceId: {
        type: String,     // paymentId / orderId / adminActionId
    },

},
{ timestamps: true }
);

module.exports = mongoose.model("CoinTransaction", coinTransactionSchema);
