const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware"); // fixed capitalization
const { adminCreditCoins } = require("../controller/AccountController");
const CoinTransaction = require("../models/CoinTransaction");
const { playersByUser } = require("../games/gameState");

// -------------------- Admin Credit/Debit Coins --------------------
router.put("/credit-coins", protect, admin, adminCreditCoins);

// -------------------- Live Tactical Monitor --------------------
router.get("/tactical", protect, admin, (req, res) => {
    const data = [];

    playersByUser.forEach((player) => {
        if (!player.room) return;

        data.push({
            userId: player.userId,
            username: player.username,
            position: player.position,
            health: player.health,
            room: player.room,
        });
    });

    res.json(data);
});

// -------------------- Admin Transactions --------------------
router.get("/transactions", protect, admin, async (req, res) => {
    try {
        const { page = 1, limit = 50, search = "", type } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        // Build query
        const query = {};
        if (search) {
            query.$or = [{ referenceId: { $regex: search, $options: "i" } }];
        }
        if (type) query.type = type;

        // Fetch transactions with populated user and performedBy
        const transactions = await CoinTransaction.find(query)
            .populate("user", "username email")
            .populate("performedBy", "username email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean();

        res.json(transactions);
    } catch (err) {
        console.error("Failed to fetch transactions:", err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
