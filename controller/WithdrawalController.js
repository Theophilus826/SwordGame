const asyncHandler = require("express-async-handler");
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/UserModels");
const { updateCoins } = require("../controller/AccountController");

/* =====================================================
   USER: REQUEST WITHDRAWAL (DEBUG VERSION)
===================================================== */
const requestWithdrawal = asyncHandler(async (req, res) => {
  console.log("📥 WITHDRAW REQUEST BODY:", req.body);

  let { amount, bankName, accountNumber } = req.body;

  const MIN_WITHDRAW = 1000;

  // normalize
  amount = Number(amount);

  /* ================= VALIDATION ================= */
  if (!amount || isNaN(amount)) {
    console.log("❌ INVALID AMOUNT:", amount);
    return res.status(400).json({ message: "Amount is required or invalid" });
  }

  if (amount < MIN_WITHDRAW) {
    return res.status(400).json({
      message: `Minimum withdrawal is ₦${MIN_WITHDRAW.toLocaleString()}`,
    });
  }

  if (!bankName || !accountNumber) {
    console.log("❌ MISSING BANK DETAILS");
    return res.status(400).json({ message: "Bank details are required" });
  }

  if (accountNumber.length < 10) {
    console.log("❌ INVALID ACCOUNT NUMBER:", accountNumber);
    return res.status(400).json({ message: "Invalid account number" });
  }

  /* ================= GET USER ================= */
  const user = await User.findById(req.user._id);

  if (!user) {
    console.log("❌ USER NOT FOUND:", req.user._id);
    return res.status(404).json({ message: "User not found" });
  }

  console.log("👤 USER COINS:", user.coins);

  /* ================= BALANCE CHECK ================= */
  if (user.coins < amount) {
    console.log("❌ INSUFFICIENT BALANCE:", user.coins, amount);
    return res.status(400).json({ message: "Insufficient balance" });
  }

  /* ================= CHECK PENDING ================= */
  const existingPending = await Withdrawal.findOne({
    user: user._id,
    status: "PENDING",
  });

  if (existingPending) {
    console.log("❌ PENDING EXISTS");
    return res.status(400).json({
      message: "You already have a pending withdrawal request",
    });
  }

  /* ================= FIND ADMIN ================= */
  const admin = await User.findOne({ isAdmin: true });

  if (!admin) {
    console.log("❌ NO ADMIN FOUND");
    return res.status(500).json({
      message: "No admin configured",
    });
  }

  console.log("🛡 ADMIN FOUND:", admin._id);

  try {
    /* ================= DEBIT USER ================= */
    const debitResult = await updateCoins({
      userId: user._id,
      amount: -amount,
      type: "TRANSFER_SENT",
      description: "Withdrawal request",
      performedBy: user._id,
    });

    /* ================= CREDIT ADMIN ================= */
    await updateCoins({
      userId: admin._id,
      amount: amount,
      type: "ADMIN_CREDIT",
      description: `Withdrawal from ${user._id}`,
      performedBy: user._id,
    });

    /* ================= CREATE WITHDRAWAL ================= */
    const withdrawal = await Withdrawal.create({
      user: user._id,
      amount,
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      status: "PENDING",
    });

    console.log("✅ WITHDRAWAL CREATED:", withdrawal._id);

    return res.status(201).json({
      message: "Withdrawal submitted",
      withdrawal,
      balance: debitResult.coins,
    });
  } catch (error) {
    console.error("❌ WITHDRAW ERROR:", error);

    return res.status(500).json({
      message: error.message,
    });
  }
});

/* =====================================================
   ADMIN: GET ALL
===================================================== */
const getWithdrawals = asyncHandler(async (req, res) => {
  const withdrawals = await Withdrawal.find()
    .populate("user", "name email coins")
    .sort({ createdAt: -1 });

  res.json(withdrawals);
});

/* =====================================================
   ADMIN: APPROVE
===================================================== */
const approveWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await Withdrawal.findById(req.params.id);

  if (!withdrawal) {
    return res.status(404).json({ message: "Not found" });
  }

  withdrawal.status = "APPROVED";
  withdrawal.reviewedBy = req.user._id;

  await withdrawal.save();

  res.json({ message: "Approved", withdrawal });
});

/* =====================================================
   ADMIN: REJECT
===================================================== */
const rejectWithdrawal = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const withdrawal = await Withdrawal.findById(req.params.id);

  if (!withdrawal) {
    return res.status(404).json({ message: "Not found" });
  }

  const user = await User.findById(withdrawal.user);

  if (user) {
    await updateCoins({
      userId: user._id,
      amount: withdrawal.amount,
      type: "REFUND",
      description: "Withdrawal refund",
      performedBy: req.user._id,
    });
  }

  withdrawal.status = "REJECTED";
  withdrawal.note = reason || "Rejected";

  await withdrawal.save();

  res.json({ message: "Rejected", withdrawal });
});

/* ===================================================== */
module.exports = {
  requestWithdrawal,
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
};
