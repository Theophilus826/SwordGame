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
// Generate Monnify Reserved Account
// ==========================
const generateDepositAccount = asyncHandler(async (req, res) => {
  console.log("🚀 STEP 0: Request received");

  try {
    // STEP 1: Check user
    console.log("🚀 STEP 1: Checking user...");
    const { id: userId, name, email } = getUserFromRequest(req);
    console.log("✅ User OK:", { userId, name, email });

    // STEP 2: Check ENV
    console.log("🚀 STEP 2: Checking ENV...");
    const { MONNIFY_API_KEY, MONNIFY_SECRET_KEY, MONNIFY_CONTRACT_CODE } = process.env;

    console.log("ENV STATUS:", {
      apiKey: !!MONNIFY_API_KEY,
      secret: !!MONNIFY_SECRET_KEY,
      contract: !!MONNIFY_CONTRACT_CODE,
    });

    if (!MONNIFY_API_KEY || !MONNIFY_SECRET_KEY || !MONNIFY_CONTRACT_CODE) {
      throw new Error("Missing Monnify ENV");
    }

    // STEP 3: Get Monnify token
    console.log("🚀 STEP 3: Getting Monnify token...");
    const auth = Buffer.from(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`).toString("base64");

    const authRes = await axios.post(
      "https://sandbox.monnify.com/api/v1/auth/login",
      {},
      { headers: { Authorization: `Basic ${auth}` } }
    );

    console.log("✅ Token response:", authRes.data);

    const accessToken = authRes.data.responseBody.accessToken;
    if (!accessToken) throw new Error("No access token received");

    // STEP 4: Create reserved account
    console.log("🚀 STEP 4: Creating reserved account...");
   const response = await axios.post(
  "https://sandbox.monnify.com/api/v2/bank-transfer/reserved-accounts",
  {
    accountReference: `ref-${Date.now()}-${userId}`, // ✅ REQUIRED
    accountName: name,
    currencyCode: "NGN",
    contractCode: MONNIFY_CONTRACT_CODE,
    customerEmail: email,
  },
  {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  }
);
    console.log("✅ Account created:", response.data);

    const accountInfo = response.data.responseBody;

    // STEP 5: Validate account info
    console.log("🚀 STEP 5: Validating account info...");
    if (!accountInfo || !accountInfo.accountNumber || !accountInfo.accountReference) {
      throw new Error("Invalid account info from Monnify");
    }

    // STEP 6: Save to DB
    console.log("🚀 STEP 6: Saving to DB...");
    const deposit = await Deposit.create({
      user: userId,
      accountNumber: accountInfo.accountNumber,
      bankName: accountInfo.bankName,
      accountName: accountInfo.accountName,
      amount: 0,
      method: "bank_transfer",
      reference: accountInfo.accountReference,
      status: "PENDING",
    });

    console.log("✅ Deposit saved:", deposit._id);

    // DONE
    console.log("🎉 SUCCESS FLOW COMPLETE");

    res.json(deposit);
  } catch (err) {
    console.error("❌ ERROR CAUGHT");
    console.error("Message:", err.message);
    console.error("Status:", err.response?.status);
    console.error("Data:", err.response?.data);
    console.error("Stack:", err.stack);

    res.status(500).json({
      step: "Check server logs",
      error: err.response?.data || err.message,
    });
  }
});

// ==========================
// Confirm deposit (manual/optional)
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
      description: `Deposit via bank transfer`,
    });

    if (req.io) {
      req.io.to(userId).emit("wallet:update", {
        coins: result.coins,
        depositId: deposit._id,
      });
    }

    res.json({ message: "Deposit successful", coins: result.coins, deposit });
  } catch (err) {
    console.error("confirmDeposit error:", err.response?.data || err.message || err);
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
    console.error("getDepositHistory error:", err.response?.data || err.message || err);
    res.status(err.message === "User not authenticated" ? 401 : 500).json({ message: err.message });
  }
});

// ==========================
// Monnify Webhook
// ==========================
const virtualAccountWebhook = asyncHandler(async (req, res) => {
  try {
    const { eventType, eventData } = req.body;
    console.log("📩 Monnify Event:", eventType);

    switch (eventType) {
      case "SUCCESSFUL_TRANSACTION": {
        const accountReference = eventData.accountReference;
        const amount = eventData.amountPaid;
        const reference = eventData.paymentReference;

        const deposit = await Deposit.findOne({ reference: accountReference });
        if (!deposit || deposit.status === "COMPLETED") break;

        deposit.status = "COMPLETED";
        deposit.amount = amount;
        deposit.paymentReference = reference;
        await deposit.save();

        await updateCoins({
          userId: deposit.user.toString(),
          amount,
          type: "DEPOSIT",
          description: `Deposit via Monnify (${reference})`,
        });

        if (req.io) {
          req.io.to(deposit.user.toString()).emit("wallet:update", {
            coins: deposit.amount,
            depositId: deposit._id,
          });
        }

        break;
      }

      case "REFUND_COMPLETED":
      case "SUCCESSFUL_DISBURSEMENT":
      case "SETTLEMENT_COMPLETED":
      case "MANDATE_UPDATED":
      case "WALLET_TRANSACTION":
      case "LOW_BALANCE":
        console.log(eventType, eventData);
        break;

      default:
        console.log("Unhandled Monnify event:", eventType);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("virtualAccountWebhook error:", err.response?.data || err.message || err);
    res.status(500).json({ message: "Webhook processing failed" });
  }
});

module.exports = {
  generateDepositAccount,
  confirmDeposit,
  getDepositHistory,
  virtualAccountWebhook,
};
