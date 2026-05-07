const requestWithdrawal = asyncHandler(async (req, res) => {
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

  // 1. Deduct user balance (IMPORTANT)
  user.coins -= cleanAmount;
  await user.save();

  // 2. Create withdrawal request
  const withdrawal = await Withdrawal.create({
    user: user._id,
    amount: cleanAmount,
    bankName,
    accountNumber,
    status: "PENDING",
  });

  // 3. Credit admin
  const admin = await User.findOne({ isAdmin: true });

  if (admin) {
    admin.coins += cleanAmount;
    await admin.save();
  }

  return res.status(201).json({
    message: "Withdrawal request sent successfully",
    withdrawal,
  });
});
