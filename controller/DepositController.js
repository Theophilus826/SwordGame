const axios = require("axios");
const asyncHandler = require("express-async-handler");
const Deposit = require("../models/DepositModel");
const { updateCoins } = require("./AccountController");

// ==========================
// AUTH HELPER
// ==========================
const getUserFromRequest = (req) => {
  if (!req.user) {
    throw new Error("User not authenticated");
  }

  return {
    id: req.user.id || req.user._id,
    name: req.user.name || "User",
    email: req.user.email || "",
  };
};

// ==========================
// GENERATE DEPOSIT ACCOUNT (OPAY / PALMPAY ONLY)
// ==========================
const generateDepositAccount = asyncHandler(async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const userId = req.user.id || req.user._id;
    const { name = "User", email = "" } = req.user || {};
    const { amount, method } = req.body;

    // VALIDATION
    if (!amount || amount < 500) {
      return res.status(400).json({ message: "Minimum deposit is ₦500" });
    }

    const allowed = ["opay", "palmpay"];
    if (!allowed.includes(method)) {
      return res.status(400).json({ message: "Invalid method" });
    }

    let accountDetails = null;

    if (method === "opay") {
      accountDetails = {
        accountNumber: "6119948718",
        bankName: "OPay",
        accountName: "Theophilus Telecom",
      };
    }

    if (method === "palmpay") {
      accountDetails = {
        accountNumber: "8902710561",
        bankName: "PalmPay",
        accountName: "Theophilus Telecom",
      };
    }

    if (!accountDetails) {
      return res.status(400).json({ message: "Account not configured" });
    }

    const deposit = await Deposit.create({
      user: userId,
      ...accountDetails,
      expectedAmount: amount,
      method,
      reference: `${method}-${userId}-${Date.now()}`,
      status: "PENDING",
    });

    return res.json(deposit);
  } catch (err) {
    console.error("DEPOSIT ERROR:", err); // 🔥 THIS IS KEY
    return res.status(500).json({
      message: "Server error creating deposit",
      error: err.message,
    });
  }
});
// ==========================
// CONFIRM DEPOSIT (MANUAL)
// ==========================
const confirmDeposit = asyncHandler(async (req, res) => {
  const { id: userId } = getUserFromRequest(req);
  const { depositId } = req.body;

  if (!depositId) {
    return res.status(400).json({ message: "Deposit ID is required" });
  }

  const deposit = await Deposit.findById(depositId);

  if (!deposit) {
    return res.status(404).json({ message: "Deposit not found" });
  }

  if (deposit.status !== "PENDING") {
    return res.status(400).json({ message: "Deposit already processed" });
  }

  // ✅ USE SERVER VALUE (NO USER INPUT)
  const amount = deposit.expectedAmount;

  deposit.amount = amount;
  deposit.status = "COMPLETED";
  await deposit.save();

  const result = await updateCoins({
    userId,
    amount,
    type: "DEPOSIT",
    description: `Deposit (${deposit.method})`,
  });

  // ✅ CORRECT BALANCE EMIT
  if (req.io) {
    req.io.to(userId).emit("wallet:update", {
      coins: result.coins,
      depositId: deposit._id,
    });
  }

  res.json({
    message: "Deposit successful",
    coins: result.coins,
    deposit,
  });
});

// ==========================
// DEPOSIT HISTORY
// ==========================
const getDepositHistory = asyncHandler(async (req, res) => {
  const { id: userId } = getUserFromRequest(req);

  const history = await Deposit.find({ user: userId })
    .sort({ createdAt: -1 });

  res.json(history);
});

// ==========================
// MONNIFY WEBHOOK
// ==========================
const virtualAccountWebhook = asyncHandler(async (req, res) => {
  try {
    const { eventType, eventData } = req.body;

    if (eventType === "SUCCESSFUL_TRANSACTION") {
      const { accountReference, amountPaid, paymentReference } = eventData;

      const deposit = await Deposit.findOne({
        reference: accountReference,
      });

      if (!deposit) return res.sendStatus(200);

      // ✅ PREVENT DOUBLE CREDIT
      if (deposit.status === "COMPLETED") {
        return res.sendStatus(200);
      }

      deposit.status = "COMPLETED";
      deposit.amount = amountPaid;
      deposit.paymentReference = paymentReference;
      await deposit.save();

      const result = await updateCoins({
        userId: deposit.user.toString(),
        amount: amountPaid,
        type: "DEPOSIT",
        description: `Monnify deposit (${paymentReference})`,
      });

      if (req.io) {
        req.io.to(deposit.user.toString()).emit("wallet:update", {
          coins: result.coins,
          depositId: deposit._id,
        });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).json({ message: "Webhook failed" });
  }
});

module.exports = {
  generateDepositAccount,
  confirmDeposit,
  getDepositHistory,
  virtualAccountWebhook,
};
