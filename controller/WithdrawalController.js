const asyncHandler = require("express-async-handler");
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/UserModels");
const { updateCoins } = require("../controller/AccountController");

/* =====================================================
   USER: REQUEST WITHDRAWAL
===================================================== */
const requestWithdrawal = asyncHandler(async (req, res) => {
  const { amount, bankName, accountNumber } = req.body;

  const MIN = 1000;

  if (!amount || amount < MIN) {
    return res.status(400).json({
      message: `Minimum withdrawal is ₦${MIN.toLocaleString()}`,
    });
  }

  const user = await User.findById(req.user._id);

  if (!user) return res.status(404).json({ message: "User not found" });

  if (user.coins < amount) {
    return res.status(400).json({ message: "Insufficient balance" });
  }

  const existing = await Withdrawal.findOne({
    user: user._id,
    status: "PENDING",
  });

  if (existing) {
    return res.status(400).json({
      message: "You already have a pending withdrawal",
    });
  }

  // ❌ DO NOT credit admin here
  // ❌ DO NOT move money yet

  const withdrawal = await Withdrawal.create({
    user: user._id,
    amount,
    bankName,
    accountNumber,
    status: "PENDING",
  });

  res.status(201).json({
    message: "Withdrawal request sent successfully",
    withdrawal,
  });
});

/* =====================================================
   ADMIN: GET ALL WITHDRAWALS
===================================================== */
const getWithdrawals = asyncHandler(async (req, res) => {
  const withdrawals = await Withdrawal.find()
    .populate("user", "name email coins")
    .sort({ createdAt: -1 });

  res.json(withdrawals);
});

/* =====================================================
   ADMIN: APPROVE WITHDRAWAL
===================================================== */
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
    message: "Withdrawal approved (complete payment manually)",
    withdrawal,
  });
});

/* =====================================================
   ADMIN: REJECT WITHDRAWAL (WITH REFUND)
===================================================== */
const rejectWithdrawal = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const withdrawal = await Withdrawal.findById(req.params.id);

  if (!withdrawal) {
    return res.status(404).json({ message: "Withdrawal not found" });
  }

  if (withdrawal.status !== "PENDING") {
    return res.status(400).json({ message: "Already processed" });
  }

  try {
    const user = await User.findById(withdrawal.user);

    if (user) {
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
  } catch (error) {
    console.error("❌ Reject withdrawal error:", error);

    res.status(500).json({
      message: error.message || "Failed to reject withdrawal",
    });
  }
});

/* ===================================================== */
module.exports = {
  requestWithdrawal,
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
};
