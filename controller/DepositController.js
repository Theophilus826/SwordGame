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
// Generate Monnify Reserved Account (Live)
// ==========================
const generateDepositAccount = asyncHandler(async (req, res) => {
  try {
    const { id: userId, name, email } = getUserFromRequest(req);
    const { amount } = req.body;

    // ✅ Validate amount
    if (!amount || amount < 100) {
      return res.status(400).json({ message: "Minimum deposit is ₦100" });
    }

    // ===============================
    // ✅ CHECK EXISTING VALID DEPOSIT
    // ===============================
    const existingDeposit = await Deposit.findOne({
      user: userId,
      status: "PENDING",
    }).sort({ createdAt: -1 });

    if (
      existingDeposit &&
      existingDeposit.accountNumber &&
      existingDeposit.bankName &&
      existingDeposit.accountName
    ) {
      console.log("♻️ Reusing valid account:", existingDeposit.accountNumber);

      return res.json({
        accountNumber: existingDeposit.accountNumber,
        bankName: existingDeposit.bankName,
        accountName: existingDeposit.accountName,
        reference: existingDeposit.reference,
      });
    }

    // ===============================
    // ✅ MONNIFY CONFIG
    // ===============================
    const {
      MONNIFY_API_KEY,
      MONNIFY_SECRET_KEY,
      MONNIFY_CONTRACT_CODE,
      MONNIFY_BASE_URL,
    } = process.env;

    if (
      !MONNIFY_API_KEY ||
      !MONNIFY_SECRET_KEY ||
      !MONNIFY_CONTRACT_CODE ||
      !MONNIFY_BASE_URL
    ) {
      throw new Error("Missing Monnify ENV");
    }

    // ===============================
    // ✅ GET ACCESS TOKEN
    // ===============================
    const auth = Buffer.from(
      `${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`
    ).toString("base64");

    const authRes = await axios.post(
      `${MONNIFY_BASE_URL}/api/v1/auth/login`,
      {},
      {
        headers: { Authorization: `Basic ${auth}` },
      }
    );

    const accessToken = authRes.data?.responseBody?.accessToken;

    if (!accessToken) throw new Error("No access token received");

    // ===============================
    // ✅ CREATE RESERVED ACCOUNT
    // ===============================
    const accountReference = `deposit-${userId}-${Date.now()}`;

    const accountRes = await axios.post(
      `${MONNIFY_BASE_URL}/api/v2/bank-transfer/reserved-accounts`,
      {
        accountReference,
        accountName: name,
        currencyCode: "NGN",
        contractCode: MONNIFY_CONTRACT_CODE,
        customerEmail: email,
        getAllAvailableBanks: true,
        expectedPayment: amount,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const account = accountRes.data?.responseBody?.accounts?.[0];

    console.log("📤 Monnify response:", account);

    if (!account) throw new Error("No accounts returned from Monnify");

    // ===============================
    // ✅ SAVE DEPOSIT
    // ===============================
    const deposit = await Deposit.create({
      user: userId,
      accountNumber: account.accountNumber,
      bankName: account.bankName,
      accountName: account.accountName,
      amount: 0,
      expectedAmount: amount,
      method: "ngn",
      reference: accountReference,
      status: "PENDING",
    });

    console.log("💾 Saved deposit:", deposit);

    // ===============================
    // ✅ CLEAN RESPONSE (IMPORTANT)
    // ===============================
    return res.json({
      accountNumber: deposit.accountNumber,
      bankName: deposit.bankName,
      accountName: deposit.accountName,
      reference: deposit.reference,
    });

  } catch (err) {
    console.error("❌ generateDepositAccount error:", err);

    return res.status(500).json({
      message: "Deposit account generation failed",
      error: err.response?.data || err.message,
    });
  }
});
// ==========================
// Confirm deposit manually
// ==========================
const confirmDeposit = asyncHandler(async (req, res) => {
  const { id: userId } = getUserFromRequest(req);
  const { depositId, amount } = req.body;

  if (!depositId) return res.status(400).json({ message: "Deposit ID is required" });
  if (!amount || amount < 100) return res.status(400).json({ message: "Minimum deposit is ₦100" });

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
    description: `Deposit via bank transfer`,
  });

  if (req.io) {
    req.io.to(userId).emit("wallet:update", {
      coins: result.coins,
      depositId: deposit._id,
    });
  }

  res.json({ message: "Deposit successful", coins: result.coins, deposit });
});

// ==========================
// Get user deposit history
// ==========================
const getDepositHistory = asyncHandler(async (req, res) => {
  const { id: userId } = getUserFromRequest(req);
  const history = await Deposit.find({ user: userId }).sort({ createdAt: -1 });
  res.json(history);
});

// ==========================
// Monnify Webhook
// ==========================
const virtualAccountWebhook = asyncHandler(async (req, res) => {
  try {
    const { eventType, eventData } = req.body;

    if (eventType === "SUCCESSFUL_TRANSACTION") {
      const { accountReference, amountPaid, paymentReference } = eventData;
      const deposit = await Deposit.findOne({ reference: accountReference });
      if (deposit && deposit.status !== "COMPLETED") {
        deposit.status = "COMPLETED";
        deposit.amount = amountPaid;
        deposit.paymentReference = paymentReference;
        await deposit.save();

        await updateCoins({
          userId: deposit.user.toString(),
          amount: amountPaid,
          type: "DEPOSIT",
          description: `Deposit via Monnify (${paymentReference})`,
        });

        if (req.io) {
          req.io.to(deposit.user.toString()).emit("wallet:update", {
            coins: deposit.amount,
            depositId: deposit._id,
          });
        }
      }
    } else {
      console.log("Unhandled Monnify event:", eventType, eventData);
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
