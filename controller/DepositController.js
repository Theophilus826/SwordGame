// controllers/depositController.js
const axios = require("axios");
const asyncHandler = require("express-async-handler");
const Deposit = require("../models/DepositModel");
const { updateCoins } = require("./AccountController");

// ==========================
// Helper: Ensure user is authenticated
// ==========================
const getUserFromRequest = (req) => {
  if (!req.user || !req.user.id || !req.user.name) {
    throw new Error("User not authenticated");
  }
  return { id: req.user.id, name: req.user.name, email: req.user.email, phone: req.user.phone };
};

// ==========================
// Generate a virtual deposit account
// ==========================
const generateDepositAccount = asyncHandler(async (req, res) => {
  const { id: userId, name, email, phone } = getUserFromRequest(req);
  const { method } = req.body;

  if (!method || method !== "palmpay") {
    return res.status(400).json({ message: "Only PalmPay supported" });
  }

  try {
    // Call XIXAPAY API
    const response = await axios.post(
      "https://api.xixapay.com/api/v1/createVirtualAccount",
      {
        email,
        name,
        phoneNumber: phone,
        bankCode: ["20867"],              // PalmPay bank code
        businessId: process.env.XIXAPAY_BUSINESS_ID,
        accountType: "static",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.XIXAPAY_API_SECRET}`,
          "api-key": process.env.XIXAPAY_API_KEY
        }
      }
    );

    const accountInfo = response.data.bankAccounts?.[0];
    if (!accountInfo) {
      return res.status(500).json({ message: "Failed to generate account" });
    }

    const deposit = await Deposit.create({
      user: userId,
      accountNumber: accountInfo.accountNumber,
      bankName: accountInfo.bankName,
      accountName: accountInfo.accountName,
      amount: 0,
      method,
      status: "PENDING",
    });

    res.json(deposit);
  } catch (err) {
    console.error("generateDepositAccount error:", err.message);
    res.status(500).json({ message: "Unable to generate account" });
  }
});

// ==========================
// Confirm deposit and credit coins (manual/optional)
// ==========================
const confirmDeposit = asyncHandler(async (req, res) => {
  try {
    const { id: userId } = getUserFromRequest(req);
    const { depositId, amount } = req.body;

    if (!depositId) return res.status(400).json({ message: "Deposit ID is required" });
    if (!amount || amount < 2000) return res.status(400).json({ message: "Minimum deposit is ₦2,000" });

    const deposit = await Deposit.findById(depositId);
    if (!deposit) return res.status(404).json({ message: "Deposit not found" });
    if (deposit.status !== "PENDING") return res.status(400).json({ message: "Deposit already processed" });

    deposit.amount = amount;
    deposit.status = "COMPLETED";
    await deposit.save();

    const result = await updateCoins({
      userId,
      amount,
      type: "DEPOSIT",
      description: `Deposit via ${deposit.method}`,
    });

    if (req.io) {
      req.io.to(userId).emit("wallet:update", {
        coins: result.coins,
        depositId: deposit._id,
      });
    }

    res.json({ message: "Deposit successful", coins: result.coins, deposit });
  } catch (err) {
    console.error("confirmDeposit error:", err.message);
    res.status(err.message === "User not authenticated" ? 401 : 500).json({ message: err.message });
  }
});

// ==========================
// Get user deposit history
// ==========================
const getDepositHistory = asyncHandler(async (req, res) => {
  try {
    const { id: userId } = getUserFromRequest(req);
    const history = await Deposit.find({ user: userId }).sort({ createdAt: -1 });
    res.json(history);
  } catch (err) {
    console.error("getDepositHistory error:", err.message);
    res.status(err.message === "User not authenticated" ? 401 : 500).json({ message: err.message });
  }
});

// ==========================
// Webhook for PalmPay / XIXAPAY virtual account notifications
// ==========================
const virtualAccountWebhook = asyncHandler(async (req, res) => {
  try {
    const { accountNumber, amount, reference } = req.body;

    if (!accountNumber || !amount) {
      return res.status(400).json({ message: "Missing accountNumber or amount" });
    }

    const deposit = await Deposit.findOne({ accountNumber });
    if (!deposit) {
      return res.status(404).json({ message: "Deposit not found" });
    }

    if (deposit.status === "COMPLETED") {
      return res.status(200).json({ message: "Deposit already completed" });
    }

    // Update deposit
    deposit.status = "COMPLETED";
    deposit.amount = amount;
    deposit.reference = reference;
    await deposit.save();

    // Credit coins
    await updateCoins({
      userId: deposit.user.toString(),
      amount,
      type: "DEPOSIT",
      description: `Deposit via PalmPay (${reference})`
    });

    // Optionally emit socket update here if you pass req.io
    if (req.io) {
      req.io.to(deposit.user.toString()).emit("wallet:update", {
        coins: deposit.amount,
        depositId: deposit._id,
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("virtualAccountWebhook error:", err.message);
    res.status(500).json({ message: "Webhook processing failed" });
  }
});

module.exports = {
  generateDepositAccount,
  confirmDeposit,
  getDepositHistory,
  virtualAccountWebhook,
};
