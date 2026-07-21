const asyncHandler = require("express-async-handler");
const User = require("../models/UserModels");
const CoinTransaction = require("../models/CoinTransaction");

// ✅ NEW (centralized notifications)
const { notify } = require("../config/NotificationService");

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

    const user = await User.findById(userId);

    if (!user) throw new Error("User not found");

    const balanceBefore = user.coins || 0;

    // ❗ prevent negative unless allowed
    if (!allowNegative && balanceBefore + amount < 0) {
        throw new Error("Insufficient coin balance");
    }

    user.coins = balanceBefore + amount;
    await user.save();

    const transaction = await CoinTransaction.create({
        user: userId,
        amount,
        type,
        description,
        balanceBefore,
        balanceAfter: user.coins,
    });

    return { coins: user.coins, transaction };
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

        // 🔔 Notify user
        try {
            await notify({
                user: req.user.id,
                type: "coin",
                message: `+${coins} coins credited. Balance: ${result.coins}`,
            });
        } catch (err) {
            console.error("Notification error:", err.message);
        }

        res.json({ coins: result.coins, transaction: result.transaction });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Purchase item (debit coins)
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

        // 🔔 Notify user
        try {
            await notify({
                user: userId,
                type: "coin",
                message: `You spent ${cost} coins on ${itemName}. Balance: ${result.coins}`,
            });
        } catch (err) {
            console.error("Notification error:", err.message);
        }

        res.json({ success: true, coins: result.coins, history: result.transaction });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Daily login reward
const dailyLoginReward = asyncHandler(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const user = await User.findOneAndUpdate(
        {
            _id: req.user.id,
            $or: [{ lastLogin: { $lt: today } }, { lastLogin: { $exists: false } }]
        },
        { $set: { lastLogin: new Date() } },
        { new: true }
    );

    if (!user) {
        const existingUser = await User.findById(req.user.id);
        return res.json({ message: "Daily reward already claimed", coins: existingUser.coins });
    }

    try {
        const result = await updateCoins({
            userId: user._id,
            amount: 5,
            type: "LOGIN",
            description: "Daily login reward",
        });

        // 🔔 Notify user
        try {
            await notify({
                user: user._id,
                type: "coin",
                message: `🎁 Daily login reward! +5 coins. Balance: ${result.coins}`,
            });
        } catch (err) {
            console.error("Notification error:", err.message);
        }

        res.json({ message: "Daily login reward credited", coins: result.coins });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Get current user coins
const getMyCoins = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select("coins");
    res.json(user);
});

// Get coin transaction history
const getMyCoinHistory = asyncHandler(async (req, res) => {
    const history = await CoinTransaction.find({ user: req.user.id }).sort({ createdAt: -1 });
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

        // 🔔 Notify user
        try {
            const actionType = amount > 0 ? "credited" : "debited";
            const symbol = amount > 0 ? "+" : "";
            await notify({
                user: userId,
                type: "coin",
                message: `Admin ${actionType} ${symbol}${amount} coins. Balance: ${result.coins}`,
            });
        } catch (err) {
            console.error("Notification error:", err.message);
        }

        res.json({ message: `Coins ${amount > 0 ? "credited" : "debited"} successfully`, coins: result.coins, history: result.transaction });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Credit game win coins
const creditGameWin = asyncHandler(async (req, res) => {
    const { coins } = req.body;
    if (coins === undefined || coins === null)
        return res.status(400).json({ message: "Coins amount required" });

    try {
        const result = await updateCoins({
            userId: req.user.id,
            amount: coins,
            type: "REWARD",
            description: "Game win credit",
        });

        // 🔔 Notify user
        try {
            await notify({
                user: req.user.id,
                type: "coin",
                message: `🎮 You won! +${coins} coins. Balance: ${result.coins}`,
            });
        } catch (err) {
            console.error("Notification error:", err.message);
        }

        res.json({ coins: result.coins, transaction: result.transaction });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// ================= TRANSFER COINS =================
const transferCoins = asyncHandler(async (req, res) => {
    const { toUserId, amount, description } = req.body;
    const fromUserId = req.user.id;

    if (!toUserId || typeof amount !== "number" || amount <= 0) {
        res.status(400);
        throw new Error("Recipient ID & positive amount required");
    }

    if (fromUserId === toUserId) {
        res.status(400);
        throw new Error("Cannot transfer coins to yourself");
    }

    try {
        // Deduct from sender
        const fromUser = await User.findOneAndUpdate(
            { _id: fromUserId, coins: { $gte: amount } },
            { $inc: { coins: -amount } },
            { new: true }
        );

        if (!fromUser) throw new Error("Insufficient balance");

        // Credit recipient
        const toUser = await User.findByIdAndUpdate(
            toUserId,
            { $inc: { coins: amount } },
            { new: true }
        );

        if (!toUser) throw new Error("Recipient not found");

        // Log transactions
        const fromTransaction = await CoinTransaction.create({
            user: fromUserId,
            amount: -amount,
            type: "TRANSFER_SENT",
            description: description || `Sent coins to ${toUserId}`,
            balanceBefore: fromUser.coins + amount,
            balanceAfter: fromUser.coins,
        });

        const toTransaction = await CoinTransaction.create({
            user: toUserId,
            amount: amount,
            type: "TRANSFER_RECEIVED",
            description: description || `Received coins from ${fromUserId}`,
            balanceBefore: toUser.coins - amount,
            balanceAfter: toUser.coins,
        });

        // 🔔 Notify both users
        try {
            await notify({
                user: fromUserId,
                type: "coin",
                message: `-${amount} coins sent. Balance: ${fromUser.coins}`,
            });
            await notify({
                user: toUserId,
                type: "coin",
                message: `+${amount} coins received. Balance: ${toUser.coins}`,
            });
        } catch (err) {
            console.error("Notification error:", err.message);
        }

        res.json({
            coins: fromUser.coins,
            transaction: fromTransaction,
            recipientTransaction: toTransaction,
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});
const getWalletBalance = asyncHandler(async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const user = await User.findById(req.user.id).select("coins");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ coins: user.coins });
  } catch (err) {
    console.error("getWalletBalance error:", err);
    res.status(500).json({ message: "Server error" });
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
    transferCoins, // ✅ new endpoint
    getWalletBalance,
};
