const { creditCoins } = require("./AccountController");

// ==========================
// SIMPLE IN-MEMORY STORE
// ==========================
const games = new Map();
// gameId => {
//   userId,
//   enemies: [],
//   pot: 0,
//   status: "waiting" | "started" | "finished",
//   winnerId: null
// }

// ==========================
// HELPER: EMIT GAME EVENTS
// ==========================
function emitGameEvent(req, payload) {
  const data = { ...payload, timestamp: Date.now() };

  // Admin dashboard
  req.adminNamespace?.emit("activity:event", data);
  req.adminNamespace?.emit("game:event", data);

  // Players in room
  if (payload.gameId) {
    req.io.to(payload.gameId).emit("game:event", data);
  }
}

// ==========================
// ENSURE GAME EXISTS
// ==========================
function getOrCreateGame(gameId, userId) {
  if (!games.has(gameId)) {
    games.set(gameId, {
      userId,
      enemies: [],
      pot: 0,
      status: "waiting",
      winnerId: null,
    });
  }
  return games.get(gameId);
}

/* =========================================================
   CONFIGURE ENEMIES
========================================================= */
const configureEnemies = async (req, res) => {
  const { gameId, userId, numEnemies = 3 } = req.body;
  if (!gameId) return res.status(400).json({ message: "Missing gameId" });

  const game = getOrCreateGame(gameId, userId);

  if (game.status !== "waiting") {
    return res.status(400).json({ message: "Game already started" });
  }

  game.enemies = Array.from({ length: numEnemies }).map((_, i) => ({
    id: `enemy-${i}`,
    health: 100,
  }));

  emitGameEvent(req, {
    type: "ADMIN_CONFIG_ENEMIES",
    gameId,
    numEnemies,
  });

  return res.json({ enemies: game.enemies });
};

/* =========================================================
   START GAME
========================================================= */
const startGame = async (req, res) => {
  const { gameId } = req.body;
  const game = games.get(gameId);

  if (!game) return res.status(404).json({ message: "Game not found" });
  if (!game.enemies.length)
    return res.status(400).json({ message: "Enemies not configured" });

  game.status = "started";

  emitGameEvent(req, {
    type: "GAME_STARTED",
    gameId,
    pot: game.pot,
  });

  return res.json({ message: "Game started" });
};

/* =========================================================
   ADD TO POT
========================================================= */
const addToPot = async (req, res) => {
  const { gameId, amount } = req.body;
  if (!amount || amount <= 0)
    return res.status(400).json({ message: "Invalid amount" });

  const game = games.get(gameId);
  if (!game) return res.status(404).json({ message: "Game not found" });
  if (game.status === "finished")
    return res.status(400).json({ message: "Game finished" });

  game.pot += amount;

  emitGameEvent(req, {
    type: "ADMIN_ADD_POT",
    gameId,
    amount,
    newPot: game.pot,
  });

  return res.json({ pot: game.pot });
};

/* =========================================================
   PLAYER ATTACK
========================================================= */
const userAttackEnemy = async (req, res) => {
  const { gameId, enemyId, damage } = req.body;

  const game = games.get(gameId);
  if (!game) return res.status(404).json({ message: "Game not found" });
  if (game.status !== "started")
    return res.status(400).json({ message: "Game not active" });

  const enemy = game.enemies.find((e) => e.id === enemyId);
  if (!enemy) return res.status(404).json({ message: "Enemy not found" });

  enemy.health = Math.max(0, enemy.health - damage);

  emitGameEvent(req, {
    type: "PLAYER_ATTACK",
    gameId,
    enemyId,
    damage,
    remainingHealth: enemy.health,
  });

  return res.json({ enemyId, remainingHealth: enemy.health });
};

/* =========================================================
   FINISH GAME
========================================================= */
const finishGame = async (req, res) => {
  const { gameId, winnerId } = req.body;
  const game = games.get(gameId);

  if (!game) return res.status(404).json({ message: "Game not found" });
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
    creditedCoins = result?.coins || 0;
  }

  emitGameEvent(req, {
    type: "GAME_RESULT",
    gameId,
    winnerId,
    pot: game.pot,
    creditedCoins,
  });

  return res.json({ winnerId, creditedCoins });
};

module.exports = {
  games,
  configureEnemies,
  startGame,
  addToPot,
  userAttackEnemy,
  finishGame,
};
