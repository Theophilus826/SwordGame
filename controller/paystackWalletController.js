
const asyncHandler = require("express-async-handler");
const axios = require("axios");
const crypto = require("crypto");
const User = require("../models/UserModels");
const CoinTransaction = require("../models/CoinTransaction");
const { updateCoins } = require("./AccountController");

// Change this if your app has a different coin conversion rate.
const NAIRA_PER_COIN = 1;

const paystack = axios.create({
    baseURL: "https://api.paystack.co",
    timeout: 15000,
    headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
    },
});

// Initialize wallet funding
const initializeWalletFunding = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { amount } = req.body;

    if (
        typeof amount !== "number" ||
        !Number.isSafeInteger(amount) ||
        amount < 100
    ) {
        return res.status(400).json({
            message: "Enter a valid amount of at least ₦100",
        });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
        return res.status(500).json({
            message: "Payment service is not configured",
        });
    }

    const user = await User.findById(userId);

    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    if (!user.email) {
        return res.status(400).json({
            message: "Add an email address before funding your wallet",
        });
    }

    const reference = `coin_${crypto.randomUUID()}`;
    const amountInKobo = amount * 100;

    const response = await paystack.post("/transaction/initialize", {
        email: user.email,
        amount: String(amountInKobo),
        currency: "NGN",
        reference,
        metadata: {
            userId: String(user._id),
            purpose: "wallet_funding",
            nairaAmount: amount,
        },
    });

    if (!response.data.status) {
        return res.status(502).json({
            message: "Could not initialize payment",
        });
    }

    res.status(200).json({
        authorizationUrl: response.data.data.authorization_url,
        reference: response.data.data.reference,
        amount,
        currency: "NGN",
    });
});

// Verify payment and credit coins once
const verifyWalletFunding = asyncHandler(async (req, res) => {
    const { reference } = req.body;

    if (
        typeof reference !== "string" ||
        !/^coin_[a-f0-9-]{36}$/i.test(reference)
    ) {
        return res.status(400).json({
            message: "Invalid payment reference",
        });
    }

    // Never trust an amount or userId supplied by the frontend.
    const existing = await CoinTransaction.findOne({
        type: "PAYSTACK_FUNDING",
        description: `Paystack funding ${reference}`,
    });

    if (existing) {
        const user = await User.findById(req.user.id).select("coins");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Prevent another user from querying someone else's payment.
        if (String(existing.user) !== String(req.user.id)) {
            return res.status(403).json({
                message: "Payment does not belong to this account",
            });
        }

        return res.json({
            success: true,
            alreadyCredited: true,
            coins: user.coins,
        });
    }

    const response = await paystack.get(
        `/transaction/verify/${encodeURIComponent(reference)}`
    );

    const payment = response.data.data;

    if (
        !response.data.status ||
        payment.status !== "success" ||
        payment.currency !== "NGN"
    ) {
        return res.status(400).json({
            message: "Payment has not been confirmed",
        });
    }

    // Verify ownership, expected amount and purpose against the
    // metadata originally sent during initialization.
    if (
        String(payment.metadata?.userId) !== String(req.user.id) ||
        payment.metadata?.purpose !== "wallet_funding" ||
        !Number.isSafeInteger(payment.metadata?.nairaAmount) ||
        payment.amount !== payment.metadata.nairaAmount * 100
    ) {
        return res.status(400).json({
            message: "Payment details do not match",
        });
    }

    const coins = payment.metadata.nairaAmount / NAIRA_PER_COIN;

    if (!Number.isSafeInteger(coins) || coins <= 0) {
        return res.status(400).json({
            message: "Invalid coin conversion",
        });
    }

    // Atomic increment and a unique payment record are recommended
    // for production to prevent duplicate webhook/callback credits.
    const result = await updateCoins({
        userId: req.user.id,
        amount: coins,
        type: "PAYSTACK_FUNDING",
        description: `Paystack funding ${reference}`,
    });

    res.json({
        success: true,
        message: "Wallet funded successfully",
        coins: result.coins,
        transaction: result.transaction,
    });
});

module.exports = {
    initializeWalletFunding,
    verifyWalletFunding,
};
