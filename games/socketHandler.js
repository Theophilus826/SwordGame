const { players, playersByUser, getOrCreatePlayer } = require("./gameState");

// ==========================
// GAME STATE STORE
// ==========================
const games = new Map();
// gameId => {
//   hostId,
//   enemiesConfigured,
//   numEnemies,
//   pot,
//   status, // waiting | started | finished
//   players: []
// }

// ==========================
// HELPERS
// ==========================

const safeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const emitTacticalUpdate = (io) => {
  const data = [...playersByUser.values()]
    .filter((p) => p.room)
    .map((p) => ({
      userId: p.userId,
      username: p.username,
      position: p.position,
      health: p.health,
      room: p.room,
    }));

  io.emit("tacticalUpdate", { players: data });
};

const emitGameEvent = (io, adminNamespace, gameId, payload) => {
  if (!gameId) return;

  const event = {
    ...payload,
    gameId,
    timestamp: Date.now(),
  };

  io.to(gameId).emit("game:event", event);
  adminNamespace.emit("game:event", event);
};

const emitActivity = (adminNamespace, payload) => {
  adminNamespace.emit("activity:event", {
    ...payload,
    timestamp: Date.now(),
  });
};

const getOrInitGame = (gameId) => {
  if (!games.has(gameId)) {
    games.set(gameId, {
      hostId: null,
      enemiesConfigured: false,
      numEnemies: 0,
      pot: 0,
      status: "waiting",
      players: [],
    });
  }
  return games.get(gameId);
};

const cleanupGameIfEmpty = (gameId) => {
  const stillHasPlayers = [...playersByUser.values()].some(
    (p) => p.room === gameId
  );

  if (!stillHasPlayers) {
    games.delete(gameId);
  }
};

// ==========================
// REGISTER SOCKETS
// ==========================
function registerGameSockets(io, adminNamespace, socket) {
  const player = getOrCreatePlayer(socket);

  // 🔥 Prevent duplicate sessions
  if (player.socketId && player.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(player.socketId);
    oldSocket?.disconnect(true);
  }

  player.socketId = socket.id;
  players.set(socket.id, player);

  // ==========================
  // JOIN ROOM
  // ==========================
  socket.on("joinRoom", (gameId, callback) => {
    if (!gameId) return callback?.({ joined: false });

    const game = getOrInitGame(gameId);

    socket.join(gameId);
    player.room = gameId;

    if (!game.players.includes(player.userId)) {
      game.players.push(player.userId);
    }

    if (!game.hostId) {
      game.hostId = player.userId;
    }

    // 🔁 Sync full game state on join
    socket.emit("game:sync", {
      gameId,
      status: game.status,
      pot: game.pot,
      enemies: game.numEnemies,
      enemiesConfigured: game.enemiesConfigured,
      players: game.players,
    });

    emitGameEvent(io, adminNamespace, gameId, {
      type: "PLAYER_JOINED",
      userId: player.userId,
      username: player.username,
    });

    emitActivity(adminNamespace, {
      type: "PLAYER_JOINED",
      userId: player.userId,
      username: player.username,
      room: gameId,
    });

    emitTacticalUpdate(io);

    callback?.({
      joined: true,
      status: game.status,
      pot: game.pot,
      enemies: game.numEnemies,
    });
  });

  // ==========================
  // INIT PLAYER
  // ==========================
  socket.emit("init", {
    self: player,
    players: [...playersByUser.values()].filter(
      (p) => p.room === player.room
    ),
  });

  // ==========================
  // HOST CONFIGURE ENEMIES
  // ==========================
  socket.on("host:configureEnemies", ({ gameId, numEnemies }) => {
    const enemies = safeNumber(numEnemies);
    if (!gameId || enemies <= 0) return;

    const game = getOrInitGame(gameId);
    if (game.status !== "waiting") return;

    game.enemiesConfigured = true;
    game.numEnemies = enemies;

    emitGameEvent(io, adminNamespace, gameId, {
      type: "ENEMIES_CONFIGURED",
      enemies,
    });

    emitActivity(adminNamespace, {
      type: "ENEMIES_CONFIGURED",
      gameId,
      enemies,
    });
  });

  // ==========================
  // HOST ADD TO POT
  // ==========================
  socket.on("host:addToPot", ({ gameId, amount }) => {
    const value = safeNumber(amount);
    if (!gameId || value <= 0) return;

    const game = getOrInitGame(gameId);
    if (game.status !== "waiting" && game.status !== "started") return;

    game.pot += value;

    emitGameEvent(io, adminNamespace, gameId, {
      type: "ADMIN_ADD_POT",
      amount: value,
      newPot: game.pot,
    });

    emitActivity(adminNamespace, {
      type: "ADMIN_ADD_POT",
      gameId,
      amount: value,
      newPot: game.pot,
    });
  });

  // ==========================
  // HOST START GAME
  // ==========================
  socket.on("host:startGame", ({ gameId }) => {
    if (!gameId) return;

    const game = getOrInitGame(gameId);

    // 🚨 HARD VALIDATION
    if (game.status !== "waiting") return;
    if (!game.enemiesConfigured) return;
    if (game.numEnemies <= 0) return;
    if (game.pot <= 0) return;
    if (!game.players.length) return;

    game.status = "started";

    emitGameEvent(io, adminNamespace, gameId, {
      type: "GAME_STARTED",
      status: "started",
      pot: game.pot,
      enemies: game.numEnemies,
    });

    emitActivity(adminNamespace, {
      type: "GAME_STARTED",
      gameId,
      pot: game.pot,
    });
  });

  // ==========================
  // HOST END GAME
  // ==========================
  socket.on("host:endGame", ({ gameId, winnerId, creditedCoins }) => {
    const game = games.get(gameId);
    if (!game || game.status !== "started") return;

    game.status = "finished";

    emitGameEvent(io, adminNamespace, gameId, {
      type: "GAME_RESULT",
      winnerId,
      creditedCoins: safeNumber(creditedCoins),
      pot: game.pot,
      status: "finished",
    });

    emitActivity(adminNamespace, {
      type: "GAME_RESULT",
      gameId,
      winnerId,
      creditedCoins,
      pot: game.pot,
    });
  });

  // ==========================
  // DISCONNECT
  // ==========================
  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (!p) return;

    players.delete(socket.id);

    if (p.room) {
      const game = games.get(p.room);

      if (game) {
        game.players = game.players.filter(
          (id) => id !== p.userId
        );

        emitGameEvent(io, adminNamespace, p.room, {
          type: "PLAYER_DISCONNECTED",
          userId: p.userId,
          username: p.username,
        });

        emitActivity(adminNamespace, {
          type: "PLAYER_DISCONNECTED",
          userId: p.userId,
          room: p.room,
        });

        cleanupGameIfEmpty(p.room);
      }
    }

    emitTacticalUpdate(io);
  });
}

module.exports = {
  registerGameSockets,
  games,
};
