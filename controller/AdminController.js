exports.adminCreditCoins = asyncHandler(async (req, res) => {
    const { userId, amount, description } = req.body;

    if (!amount || amount <= 0) {
        res.status(400);
        throw new Error("Invalid credit amount");
    }

    const existingUser = await User.findById(userId);

    if (!existingUser) {
        res.status(404);
        throw new Error("User not found");
    }

    const balanceBefore = existingUser.coins;

    // ✅ Atomic update (same pattern as debit)
    const user = await User.findOneAndUpdate(
        { _id: userId },               // condition kept for symmetry
        { $inc: { coins: amount } },
        { new: true }
    );

    if (!user) {
        res.status(400);
        throw new Error("Credit failed");
    }

    await CoinTransaction.create({
        user: user._id,
        amount: amount,                 // ✅ positive value
        type: "ADMIN_CREDIT",
        description: description || "Admin credit",

        balanceBefore,
        balanceAfter: user.coins,

        // ✅ Audit Trail
        performedBy: req.user._id,
    });

    res.json({
        message: "Coins credited successfully",
        coins: user.coins,
    });
});
