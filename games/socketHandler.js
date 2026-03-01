const { players, playersByUser, getOrCreatePlayer } = require("./gameState");

// ==========================
// GAME STATE STORE
// ==========================
const games = new Map();
// gameId => { enemiesConfigured, numEnemies, pot, status }

// ==========================
// EMITTER HELPERS
// ==========================

// Send tactical updates to everyone
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

// Emit game event (room scoped + admin via main namespace)
const emitGameEvent = (io, gameId, payload) => {
  if (!gameId) return;

  const event = {
    ...payload,
    gameId,
    timestamp: Date.now(),
  };

  // Players in this game room
  io.to(gameId).emit("game:event", event);

  // Admin dashboard (now also connected to main namespace)
  io.emit("game:event", event);
};

// Emit activity event globally
const emitActivity = (io, payload) => {
  const event = {
    ...payload,
    timestamp: Date.now(),
  };

  io.emit("activity:event", event);
};

// ==========================
// GAME UTILS
// ==========================
const getOrInitGame = (gameId) => {
  if (!games.has(gameId)) {
    games.set(gameId, {
      enemiesConfigured: false,
      numEnemies: 0,
      pot: 0,
      status: "waiting",
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
function registerGameSockets(io, socket) {
  const player = getOrCreatePlayer(socket);

  // Prevent duplicate connections
  if (player.socketId && player.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(player.socketId);
    oldSocket?.disconnect(true);
  }

  player.socketId = socket.id;
  players.set(socket.id, player);

  // ==========================
  // JOIN GAME ROOM
  // ==========================
  socket.on("joinRoom", (gameId) => {
    if (!gameId) return;

    socket.join(gameId);
    player.room = gameId;

    const game = getOrInitGame(gameId);

    // Sync if already started
    if (game.status === "started") {
      socket.emit("game:event", {
        type: "GAME_STARTED",
        gameId,
        pot: game.pot,
        enemies: game.numEnemies,
        status: game.status,
        timestamp: Date.now(),
      });
    }

    socket.to(gameId).emit("playerJoined", player);

    emitGameEvent(io, gameId, {
      type: "PLAYER_JOINED",
      userId: player.userId,
      username: player.username,
    });

    emitActivity(io, {
      type: "PLAYER_JOINED",
      userId: player.userId,
      username: player.username,
      room: gameId,
    });

    emitTacticalUpdate(io);
  });

  // ==========================
  // INIT
  // ==========================
  socket.emit("init", {
    self: player,
    players: [...playersByUser.values()].filter(
      (p) => p.room === player.room
    ),
  });

  // ==========================
  // HOST: CONFIGURE ENEMIES
  // ==========================
  socket.on("host:configureEnemies", ({ gameId, numEnemies }) => {
    if (!gameId || !numEnemies || numEnemies <= 0) return;

    const game = getOrInitGame(gameId);
    game.enemiesConfigured = true;
    game.numEnemies = Number(numEnemies);

    emitGameEvent(io, gameId, {
      type: "ENEMIES_CONFIGURED",
      enemies: game.numEnemies,
    });

    emitActivity(io, {
      type: "ENEMIES_CONFIGURED",
      gameId,
      enemies: game.numEnemies,
    });
  });

  // ==========================
  // HOST: START GAME
  // ==========================
  socket.on("host:startGame", ({ gameId, pot = 0 }) => {
    if (!gameId) return;

    const game = getOrInitGame(gameId);

    game.status = "started";
    game.pot = Number(pot) || 0;

    emitGameEvent(io, gameId, {
      type: "GAME_STARTED",
      status: "started",
      pot: game.pot,
      enemies: game.numEnemies,
    });

    emitActivity(io, {
      type: "GAME_STARTED",
      gameId,
      pot: game.pot,
    });
  });

  // ==========================
  // HOST: ADD TO POT
  // ==========================
  socket.on("host:addToPot", ({ gameId, amount }) => {
    if (!gameId || !amount) return;

    const game = getOrInitGame(gameId);
    game.pot += Number(amount);

    emitGameEvent(io, gameId, {
      type: "ADMIN_ADD_POT",
      amount,
      newPot: game.pot,
    });

    emitActivity(io, {
      type: "ADMIN_ADD_POT",
      gameId,
      amount,
      newPot: game.pot,
    });
  });

  // ==========================
  // HOST: END GAME
  // ==========================
  socket.on("host:endGame", ({ gameId, winnerId, creditedCoins }) => {
    const game = games.get(gameId);
    if (!game) return;

    game.status = "finished";

    emitGameEvent(io, gameId, {
      type: "GAME_RESULT",
      winnerId,
      creditedCoins,
      pot: game.pot,
      status: "finished",
    });

    emitActivity(io, {
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
      socket.to(p.room).emit("playerLeft", p.userId);

      emitGameEvent(io, p.room, {
        type: "PLAYER_DISCONNECTED",
        userId: p.userId,
        username: p.username,
      });

      emitActivity(io, {
        type: "PLAYER_DISCONNECTED",
        userId: p.userId,
        room: p.room,
      });

      cleanupGameIfEmpty(p.room);
    }

    emitTacticalUpdate(io);
  });
}

module.exports = {
  registerGameSockets,
  games,
};
