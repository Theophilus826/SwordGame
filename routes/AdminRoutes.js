const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/AuthMiddleware");
const { adminCreditCoins } = require("../controller/AccountController");
const CoinTransaction = require("../models/CoinTransaction");
const { playersByUser } = require("../games/gameState");
const { games, configureGameEnemies, startGameByAdmin, addToPotByAdmin, endGameByAdmin } = require("../controller/GameController");

// -------------------- Admin Credit/Debit Coins --------------------
router.put("/credit-coins", protect, admin, adminCreditCoins);

// -------------------- Live Tactical Monitor --------------------
router.get("/tactical", protect, admin, (req, res) => {
  try {
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

    return res.status(200).json({ players: data });
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
        { "user.username": { $regex: search, $options: "i" } }
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
router.get("/games", protect, admin, (req, res) => {
  try {
    const allGames = Array.from(games.values());

    return res.status(200).json({
      games: allGames.map(game => ({
        gameId: game.id,
        userId: game.userId,
        pot: game.pot,
        status: game.status,
        enemies: game.enemies,
        createdAt: game.createdAt,
      }))
    });
  } catch (err) {
    console.error("Failed to fetch games:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// -------------------- Configure Enemies --------------------
router.post("/configure-enemies", protect, admin, async (req, res) => {
  try {
    const { gameId, numEnemies = 3 } = req.body;
    const game = games.get(gameId);
    if (!game) return res.status(404).json({ message: "Game not found" });

    configureGameEnemies(gameId, numEnemies);
    game.status = "waiting";

    // Emit to players in game room
    req.io.to(gameId).emit("game:enemiesConfigured", { gameId });

    // Emit to admin dashboard
    req.adminNamespace.emit("activity:event", {
      type: "ADMIN_CONFIG_ENEMIES",
      gameId,
      numEnemies,
      timestamp: Date.now(),
    });
    req.adminNamespace.emit("game:event", {
      type: "ADMIN_CONFIG_ENEMIES",
      gameId,
      status: "waiting",
      timestamp: Date.now(),
    });

    return res.status(200).json({ success: true, message: "Enemies configured" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// -------------------- Start Game --------------------
router.post("/start-game", protect, admin, async (req, res) => {
  try {
    const { gameId } = req.body;
    const game = games.get(gameId);
    if (!game) return res.status(404).json({ message: "Game not found" });

    startGameByAdmin(gameId);

    // Emit to players
    req.io.to(gameId).emit("game:started", { gameId });

    // Emit to admin dashboard
    req.adminNamespace.emit("activity:event", {
      type: "GAME_STARTED",
      gameId,
      timestamp: Date.now(),
    });
    req.adminNamespace.emit("game:event", {
      type: "GAME_STARTED",
      gameId,
      status: "started",
      timestamp: Date.now(),
    });

    return res.status(200).json({ success: true, message: "Game started" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// -------------------- Add to Pot --------------------
router.post("/add-to-pot", protect, admin, async (req, res) => {
  try {
    const { gameId, amount } = req.body;
    const game = games.get(gameId);
    if (!game) return res.status(404).json({ message: "Game not found" });

    const newPot = addToPotByAdmin(gameId, amount);

    req.io.to(gameId).emit("game:potUpdated", { gameId, newPot, amount });

    req.adminNamespace.emit("activity:event", {
      type: "ADMIN_ADD_POT",
      gameId,
      amount,
      newPot,
      timestamp: Date.now(),
    });
    req.adminNamespace.emit("game:event", {
      type: "ADMIN_ADD_POT",
      gameId,
      amount,
      newPot,
      timestamp: Date.now(),
    });

    return res.status(200).json({ success: true, newPot });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// -------------------- End Game --------------------
router.post("/end-game", protect, admin, async (req, res) => {
  try {
    const { gameId, winnerId, creditedCoins } = req.body;
    const game = games.get(gameId);
    if (!game) return res.status(404).json({ message: "Game not found" });

    endGameByAdmin(gameId, winnerId, creditedCoins);

    req.io.to(gameId).emit("game:ended", { gameId, winnerId, creditedCoins });

    req.adminNamespace.emit("activity:event", {
      type: "GAME_RESULT",
      gameId,
      winnerId,
      creditedCoins,
      timestamp: Date.now(),
    });
    req.adminNamespace.emit("game:event", {
      type: "GAME_RESULT",
      gameId,
      winnerId,
      creditedCoins,
      status: "finished",
      timestamp: Date.now(),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
