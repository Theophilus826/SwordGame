const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middleware/AuthMiddleware");
const { adminCreditCoins } = require("../controller/AccountController");

const {
  getAllGames,
  configureEnemies,
  startGame,
  addToPot,
  finishGame,
} = require("../controller/GameController");

const CoinTransaction = require("../models/CoinTransaction");
const { playersByUser } = require("../games/gameState");

// -------------------- Admin Credit/Debit Coins --------------------
router.put("/credit-coins", protect, admin, adminCreditCoins);

// -------------------- Live Tactical Monitor --------------------
router.get("/tactical", protect, admin, (req, res) => {
  try {
    const players = [];

    playersByUser.forEach((player) => {
      if (!player.room) return;

      players.push({
        userId: player.userId,
        username: player.username,
        position: player.position,
        health: player.health,
        room: player.room,
      });
    });

    return res.status(200).json({ players });
  } catch (err) {
    console.error("Failed to fetch tactical data:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// -------------------- Admin Transactions --------------------
router.get("/transactions", protect, admin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = "", type } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query = {};
    if (search) {
      query.$or = [
        { referenceId: { $regex: search, $options: "i" } },
        { "user.username": { $regex: search, $options: "i" } },
      ];
    }
    if (type) query.type = type;

    const transactions = await CoinTransaction.find(query)
      .populate("user", "username email")
      .populate("performedBy", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    return res.status(200).json({ transactions });
  } catch (err) {
    console.error("Failed to fetch transactions:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// -------------------- Admin Games --------------------
router.get("/games", protect, admin, getAllGames);

// -------------------- Configure Enemies --------------------
router.post("/configure-enemies", protect, admin, configureEnemies);

// -------------------- Start Game --------------------
router.post("/start-game", protect, admin, startGame);

// -------------------- Add to Pot --------------------
router.post("/add-to-pot", protect, admin, addToPot);

// -------------------- End Game --------------------
router.post("/end-game", protect, admin, finishGame);

module.exports = router;
