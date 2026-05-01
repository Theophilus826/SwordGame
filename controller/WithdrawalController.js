const asyncHandler = require("express-async-handler");
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/UserModels");
const { updateCoins } = require("../controller/AccountController");

/* =====================================================
   USER: REQUEST WITHDRAWAL (DEBUGGED)
===================================================== */
const requestWithdrawal = asyncHandler(async (req, res) => {
  console.log("🔥 [WITHDRAW REQUEST HIT]");
  console.log("📦 BODY:", req.body);
  console.log("👤 USER:", req.user);

  const { amount, bankName, accountNumber } = req.body;

  const MIN = 1000;
  const cleanAmount = Number(amount);

  console.log("💰 Parsed Amount:", cleanAmount);

  if (!cleanAmount || cleanAmount < MIN) {
    console.log("❌ Failed: Invalid or below minimum amount");
    return res.status(400).json({
      message: `Minimum withdrawal is ₦${MIN.toLocaleString()}`,
    });
  }

  const user = await User.findById(req.user._id);

  console.log("👤 DB USER FOUND:", user);

  if (!user) {
    console.log("❌ User not found in DB");
    return res.status(404).json({ message: "User not found" });
  }

  console.log("💰 User Coins:", user.coins);

  if (user.coins < cleanAmount) {
    console.log("❌ Insufficient balance");
    return res.status(400).json({ message: "Insufficient balance" });
  }

  

  const withdrawal = await Withdrawal.create({
    user: user._id,
    amount: cleanAmount,
    bankName,
    accountNumber,
    status: "PENDING",
  });

  console.log("✅ Withdrawal Created:", withdrawal);

  return res.status(201).json({
    message: "Withdrawal request sent successfully",
    withdrawal,
  });
});

/* =====================================================
   ADMIN: GET ALL WITHDRAWALS (DEBUG)
===================================================== */
const getWithdrawals = asyncHandler(async (req, res) => {
  console.log("📊 Fetching all withdrawals");

  const withdrawals = await Withdrawal.find()
    .populate("user", "name email coins")
    .sort({ createdAt: -1 });

  console.log("📦 Withdrawals count:", withdrawals.length);

  res.json(withdrawals);
});

/* =====================================================
   ADMIN: APPROVE WITHDRAWAL (DEBUG)
===================================================== */
const approveWithdrawal = asyncHandler(async (req, res) => {
  console.log("✅ Approve withdrawal:", req.params.id);

  const withdrawal = await Withdrawal.findById(req.params.id);

  console.log("📦 Found withdrawal:", withdrawal);

  if (!withdrawal) {
    console.log("❌ Withdrawal not found");
    return res.status(404).json({ message: "Withdrawal not found" });
  }

  if (withdrawal.status !== "PENDING") {
    console.log("❌ Already processed");
    return res.status(400).json({ message: "Already processed" });
  }

  withdrawal.status = "APPROVED";
  withdrawal.reviewedBy = req.user._id;

  await withdrawal.save();

  console.log("✅ Withdrawal approved");

  res.json({
    message: "Withdrawal approved (complete payment manually)",
    withdrawal,
  });
});

/* =====================================================
   ADMIN: REJECT WITHDRAWAL (DEBUG)
===================================================== */
const rejectWithdrawal = asyncHandler(async (req, res) => {
  console.log("❌ Reject withdrawal:", req.params.id);
  console.log("📝 Reason:", req.body.reason);

  const withdrawal = await Withdrawal.findById(req.params.id);

  console.log("📦 Withdrawal found:", withdrawal);

  if (!withdrawal) {
    console.log("❌ Withdrawal not found");
    return res.status(404).json({ message: "Withdrawal not found" });
  }

  if (withdrawal.status !== "PENDING") {
    console.log("❌ Already processed");
    return res.status(400).json({ message: "Already processed" });
  }

  try {
    const user = await User.findById(withdrawal.user);

    console.log("👤 User for refund:", user);

    if (user) {
      console.log("💰 Refunding coins:", withdrawal.amount);

      await updateCoins({
        userId: user._id,
        amount: withdrawal.amount,
        type: "REFUND",
        description: "Withdrawal rejected refund",
        performedBy: req.user._id,
      });
    }

    withdrawal.status = "REJECTED";
    withdrawal.note = req.body.reason || "Rejected by admin";

    await withdrawal.save();

    console.log("❌ Withdrawal rejected + refunded");

    res.json({
      message: "Withdrawal rejected and refunded",
      withdrawal,
    });
  } catch (error) {
    console.log("🔥 ERROR IN REJECT WITHDRAWAL:", error);
    res.status(500).json({
      message: error.message || "Failed to reject withdrawal",
    });
  }
});

module.exports = {
  requestWithdrawal,
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
};
