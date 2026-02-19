const asyncHandler = require("express-async-handler");
const User = require("../models/UserModels");
const CoinTransaction = require("../models/CoinTransaction");


// ================= CORE COIN ENGINE =================
const updateCoins = async ({
    userId,
    amount,
    type,
    description,
    allowNegative = false
}) => {

    if (!userId) throw new Error("User ID is required");
    if (typeof amount !== "number") throw new Error("Amount must be numeric");
    if (!type) throw new Error("Transaction type required");

    const user = await User.findOneAndUpdate(
        allowNegative
            ? { _id: userId }
            : { _id: userId, coins: { $gte: Math.abs(amount < 0 ? amount : 0) } },
        { $inc: { coins: amount } },
        { new: true }
    );

    if (!user) {
        throw new Error("Insufficient coin balance");
    }

    const balanceAfter = user.coins;
    const balanceBefore = balanceAfter - amount;

    const transaction = await CoinTransaction.create({
        user: userId,
        amount: amount,     // ✅ FIXED
        type: type,         // ✅ FIXED
        description,
        balanceBefore,
        balanceAfter,
    });

    return { coins: balanceAfter, transaction };
};


// ================= USER COINS =================
const creditCoins = asyncHandler(async (req, res) => {
    const { coins } = req.body;

    if (coins === undefined || coins === null)
        return res.status(400).json({ message: "Coins amount required" });

    try {
        const result = await updateCoins({
            userId: req.user.id,
            amount: coins,
            type: "REWARD",
            description: "Manual wallet credit",
        });

        res.json({ coins: result.coins });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});


const purchaseItem = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { itemName, cost } = req.body;

    if (typeof cost !== "number" || cost <= 0)
        throw new Error("Invalid purchase cost");

    try {
        const result = await updateCoins({
            userId,
            amount: -cost,
            type: "PURCHASE",
            description: `Purchased ${itemName}`,
        });

        res.json({
            success: true,
            coins: result.coins,
            history: result.transaction,
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
});



const dailyLoginReward = asyncHandler(async (req, res) => {

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ✅ Atomic login guard
    const user = await User.findOneAndUpdate(
        {
            _id: req.user.id,
            $or: [
                { lastLogin: { $lt: today } },
                { lastLogin: { $exists: false } }
            ]
        },
        { $set: { lastLogin: new Date() } },
        { new: true }
    );

    if (!user) {
        const existingUser = await User.findById(req.user.id);
        return res.json({
            message: "Daily reward already claimed",
            coins: existingUser.coins,
        });
    }

    try {
        const result = await updateCoins({
            userId: user._id,
            amount: 5,
            type: "LOGIN",
            description: "Daily login reward",
        });

        res.json({
            message: "Daily login reward credited",
            coins: result.coins,
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});



const getMyCoins = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select("coins");
    res.json(user);
});


const getMyCoinHistory = asyncHandler(async (req, res) => {
    const history = await CoinTransaction.find({ user: req.user.id })
        .sort({ createdAt: -1 });

    res.json(history);
});


// ================= ADMIN COINS =================
const adminCreditCoins = asyncHandler(async (req, res) => {
    const { userId, amount, description } = req.body;

    if (!userId || typeof amount !== "number") {
        res.status(400);
        throw new Error("User ID & numeric amount required");
    }

    const type = amount > 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT";

    try {
        const result = await updateCoins({
            userId,
            amount,
            type,
            description: description || "Admin balance update",
        });

        res.json({
            message: `Coins ${amount > 0 ? "credited" : "debited"} successfully`,
            coins: result.coins,
            history: result.transaction,
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

const creditGameWin = asyncHandler(async (req, res) => {
  const { coins } = req.body;

  if (coins === undefined || coins === null) {
    return res.status(400).json({ message: "Coins amount required" });
  }

  try {
    // ✅ Use "REWARD" type to match CoinTransaction enum
    const result = await updateCoins({
      userId: req.user.id,
      amount: coins,
      type: "REWARD",
      description: "Game win credit",
    });

    res.json({ coins: result.coins, transaction: result.transaction });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


module.exports = {
    creditCoins,
    updateCoins,
    purchaseItem,
    dailyLoginReward,
    getMyCoins,
    getMyCoinHistory,
    adminCreditCoins,
    creditGameWin,
};
