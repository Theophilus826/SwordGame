const asyncHandler = require("express-async-handler");
const { creditCoins } = require("./AccountController");
const { v4: uuidv4 } = require("uuid");

// ==========================
// IN-MEMORY GAME STORAGE
// ==========================
const games = new Map();

// ==========================
// HELPER: EMIT BOTH EVENTS
// ==========================
function emitAdminEvents(req, payload) {
  const data = {
    ...payload,
    timestamp: Date.now(),
  };

  req.adminNamespace.emit("activity:event", data);
  req.adminNamespace.emit("game:event", data);
}

/* =========================================================
   CREATE GAME (WAITING FOR ADMIN)
========================================================= */
const createGame = asyncHandler(async (req, res) => {
  const { userId, pot = 10 } = req.body;

  if (!userId)
    return res.status(400).json({ message: "Invalid user" });

  const game = {
    id: uuidv4(),
    userId,
    enemies: [],
    pot,
    status: "waiting",
    winnerId: null,
    createdAt: new Date(),
  };

  games.set(game.id, game);

  emitAdminEvents(req, {
    type: "GAME_CREATED",
    userId,
    gameId: game.id,
    pot,
    status: game.status,
  });

  res.json({ game });
});

/* =========================================================
   CONFIGURE ENEMIES
========================================================= */
const configureEnemies = asyncHandler(async (req, res) => {
  const { gameId, numEnemies = 3, positions } = req.body;

  const game = games.get(gameId);
  if (!game) return res.status(404).json({ message: "Game not found" });
  if (game.status !== "waiting")
    return res.status(400).json({ message: "Game already started" });

  game.enemies = Array.from({ length: numEnemies }).map((_, i) => ({
    id: uuidv4(),
    health: 100,
    position:
      positions?.[i] || {
        x: Math.random() * 10,
        y: 0,
        z: Math.random() * 10,
      },
  }));

  emitAdminEvents(req, {
    type: "ADMIN_CONFIG_ENEMIES",
    gameId,
    numEnemies,
  });

  req.io.to(gameId).emit("game:enemiesConfigured", {
    gameId,
    enemies: game.enemies,
  });

  res.json({ enemies: game.enemies });
});

/* =========================================================
   START GAME
========================================================= */
const startGame = asyncHandler(async (req, res) => {
  const { gameId } = req.body;

  const game = games.get(gameId);
  if (!game) return res.status(404).json({ message: "Game not found" });
  if (game.status !== "waiting")
    return res.status(400).json({ message: "Game already started" });
  if (!game.enemies.length)
    return res.status(400).json({ message: "Enemies not configured" });

  game.status = "started";

  req.io.to(gameId).emit("game:started", { gameId });

  emitAdminEvents(req, {
    type: "GAME_STARTED",
    gameId,
    status: "started",
    pot: game.pot,
  });

  res.json({ message: "Game started" });
});

/* =========================================================
   GET GAME STATE
========================================================= */
const getGameState = asyncHandler(async (req, res) => {
  const { gameId } = req.params;
  const game = games.get(gameId);
  if (!game)
    return res.status(404).json({ message: "Game not found" });

  res.json(game);
});

/* =========================================================
   USER ATTACKS ENEMY
========================================================= */
const userAttackEnemy = asyncHandler(async (req, res) => {
  const { gameId, enemyId, damage } = req.body;

  const game = games.get(gameId);
  if (!game) return res.status(404).json({ message: "Game not found" });
  if (game.status !== "started")
    return res.status(400).json({ message: "Game not active" });

  const enemy = game.enemies.find((e) => e.id === enemyId);
  if (!enemy)
    return res.status(404).json({ message: "Enemy not found" });

  enemy.health = Math.max(0, enemy.health - damage);

  req.io.to(gameId).emit("game:enemyDamaged", {
    gameId,
    enemyId,
    damage,
    remainingHealth: enemy.health,
  });

  emitAdminEvents(req, {
    type: "PLAYER_ATTACK",
    gameId,
    enemyId,
    damage,
    remainingHealth: enemy.health,
  });

  res.json({ enemyId, enemyHealth: enemy.health, damage });
});

/* =========================================================
   FINISH GAME
========================================================= */
const finishGameBackend = asyncHandler(async (req, res) => {
  const { gameId, winnerId } = req.body;

  const game = games.get(gameId);
  if (!game)
    return res.status(404).json({ message: "Game not found" });
  if (game.status === "finished")
    return res.status(400).json({ message: "Game already finished" });

  game.status = "finished";
  game.winnerId = winnerId;

  let creditedCoins = 0;
  if (winnerId === game.userId) {
    const result = await creditCoins({
      userId: winnerId,
      coins: game.pot,
    });
    creditedCoins = result.coins;
  }

  req.io.to(gameId).emit("game:finished", {
    gameId,
    winnerId,
    creditedCoins,
  });

  emitAdminEvents(req, {
    type: "GAME_RESULT",
    gameId,
    winnerId,
    pot: game.pot,
    creditedCoins,
    status: "finished",
  });

  res.json({
    message: "Game finished",
    winnerId,
    creditedCoins,
  });
});

/* =========================================================
   ADMIN ADDS TO POT
========================================================= */
const addToPot = asyncHandler(async (req, res) => {
  const { gameId, amount } = req.body;

  if (!amount || amount <= 0)
    return res.status(400).json({ message: "Invalid amount" });

  const game = games.get(gameId);
  if (!game)
    return res.status(404).json({ message: "Game not found" });
  if (game.status === "finished")
    return res.status(400).json({ message: "Game finished" });

  game.pot += amount;

  req.io.to(gameId).emit("game:potUpdated", {
    gameId,
    newPot: game.pot,
  });

  emitAdminEvents(req, {
    type: "ADMIN_ADD_POT",
    gameId,
    amount,
    newPot: game.pot,
  });

  res.json({ message: "Pot updated", pot: game.pot });
});

module.exports = {
  games,
  createGame,
  configureEnemies,
  startGame,
  getGameState,
  userAttackEnemy,
  finishGameBackend,
  addToPot,
};
