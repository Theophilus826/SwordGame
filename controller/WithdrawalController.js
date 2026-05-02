const asyncHandler = require("express-async-handler");
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/UserModels");
const { updateCoins } = require("../controller/AccountController");

/* =====================================================
   USER: REQUEST WITHDRAWAL ONLY
===================================================== */
const requestWithdrawal = asyncHandler(async (req, res) => {
  console.log("🔥 [WITHDRAW REQUEST HIT]");
  console.log("📦 BODY:", req.body);

  const { amount, bankName, accountNumber } = req.body;

  const MIN = 1000;
  const cleanAmount = Number(amount);

  if (!cleanAmount || cleanAmount < MIN) {
    return res.status(400).json({
      message: `Minimum withdrawal is ₦${MIN.toLocaleString()}`,
    });
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (user.coins < cleanAmount) {
    return res.status(400).json({ message: "Insufficient balance" });
  }

  const withdrawal = await Withdrawal.create({
    user: user._id,
    amount: cleanAmount,
    bankName,
    accountNumber,
    status: "PENDING",
  });

  return res.status(201).json({
    message: "Withdrawal request sent successfully",
    withdrawal,
  });
});

module.exports = {
  requestWithdrawal,
};
