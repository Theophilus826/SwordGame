const asyncHandler = require("express-async-handler");
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/UserModels");
const { updateCoins } = require("../controller/AccountController");

// ===============================
// USER: REQUEST WITHDRAWAL
// ===============================
const requestWithdrawal = asyncHandler(async (req, res) => {
  const { amount, bankName, accountNumber } = req.body;

  const MIN_WITHDRAW = 1000;

  // ===============================
  // VALIDATION
  // ===============================
  if (!amount || isNaN(amount)) {
    return res.status(400).json({ message: "Amount is required" });
  }

  if (amount < MIN_WITHDRAW) {
    return res.status(400).json({
      message: `Minimum withdrawal is ₦${MIN_WITHDRAW.toLocaleString()}`,
    });
  }

  if (!bankName || !accountNumber) {
    return res.status(400).json({ message: "Bank details are required" });
  }

  if (accountNumber.length < 10) {
    return res.status(400).json({ message: "Invalid account number" });
  }

  // ===============================
  // GET USER
  // ===============================
  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // ===============================
  // CHECK BALANCE
  // ===============================
  if (user.coins < amount) {
    return res.status(400).json({ message: "Insufficient balance" });
  }

  // ===============================
  // PREVENT MULTIPLE PENDING WITHDRAWALS
  // ===============================
  const existingPending = await Withdrawal.findOne({
    user: user._id,
    status: "PENDING",
  });

  if (existingPending) {
    return res.status(400).json({
      message: "You already have a pending withdrawal request",
    });
  }

  // ===============================
  // FIND ADMIN USER
  // ===============================
  const admin = await User.findOne({ role: "ADMIN" });

  if (!admin) {
    return res.status(500).json({ message: "Admin account not found" });
  }

  // ===============================
  // 1. DEBIT USER (via ledger system)
  // ===============================
  await updateCoins({
    userId: user._id,
    amount: -amount,
    type: "TRANSFER_SENT",
    description: "Withdrawal request",
    performedBy: user._id,
  });

  // ===============================
  // 2. CREDIT ADMIN WALLET (LEDGER SYSTEM)
  // ===============================
  await updateCoins({
    userId: admin._id,
    amount: amount,
    type: "ADMIN_CREDIT",
    description: `Withdrawal income from user ${user._id}`,
    performedBy: user._id,
  });

  // ===============================
  // 3. CREATE WITHDRAWAL REQUEST
  // ===============================
  const withdrawal = await Withdrawal.create({
    user: user._id,
    amount,
    bankName: bankName.trim(),
    accountNumber: accountNumber.trim(),
    status: "PENDING",
  });

  // ===============================
  // RESPONSE
  // ===============================
  res.status(201).json({
    message: "Withdrawal request submitted successfully",
    withdrawal,
    balance: user.coins - amount,
  });
});

// ===============================
// ADMIN: GET ALL WITHDRAWALS
// ===============================
const getWithdrawals = asyncHandler(async (req, res) => {
  const withdrawals = await Withdrawal.find()
    .populate("user", "name email coins")
    .sort({ createdAt: -1 });

  res.json(withdrawals);
});

// ===============================
// ADMIN: APPROVE WITHDRAWAL
// ===============================
const approveWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await Withdrawal.findById(req.params.id);

  if (!withdrawal) {
    return res.status(404).json({ message: "Withdrawal not found" });
  }

  if (withdrawal.status !== "PENDING") {
    return res.status(400).json({ message: "Already processed" });
  }

  withdrawal.status = "APPROVED";
  withdrawal.reviewedBy = req.user._id;

  await withdrawal.save();

  res.json({
    message: "Withdrawal approved (send bank transfer manually)",
    withdrawal,
  });
});

// ===============================
// ADMIN: REJECT WITHDRAWAL + REFUND
// ===============================
const rejectWithdrawal = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const withdrawal = await Withdrawal.findById(req.params.id);

  if (!withdrawal) {
    return res.status(404).json({ message: "Withdrawal not found" });
  }

  if (withdrawal.status !== "PENDING") {
    return res.status(400).json({ message: "Already processed" });
  }

  const user = await User.findById(withdrawal.user);

  if (user) {
    // refund user
    await updateCoins({
      userId: user._id,
      amount: withdrawal.amount,
      type: "REFUND",
      description: "Withdrawal rejected refund",
      performedBy: req.user._id,
    });
  }

  withdrawal.status = "REJECTED";
  withdrawal.note = reason || "Rejected by admin";

  await withdrawal.save();

  res.json({
    message: "Withdrawal rejected and refunded",
    withdrawal,
  });
});

// ===============================
module.exports = {
  requestWithdrawal,
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
};
