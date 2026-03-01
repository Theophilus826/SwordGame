const { players, playersByUser, getOrCreatePlayer } = require("./gameState");

// ==========================
// GAME STATE STORE
// ==========================
const games = new Map(); 
// gameId => { hostId, enemiesConfigured, numEnemies, pot, status, players }

// ==========================
// EMITTER HELPERS
// ==========================
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

  const event = { ...payload, gameId, timestamp: Date.now() };

  // Send to players in room
  io.to(gameId).emit("game:event", event);

  // Send to admin dashboard
  adminNamespace.emit("game:event", event);
};

const emitActivity = (adminNamespace, payload) => {
  const event = { ...payload, timestamp: Date.now() };
  adminNamespace.emit("activity:event", event);
};

// ==========================
// GAME UTILS
// ==========================
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
  if (!stillHasPlayers) games.delete(gameId);
};

// ==========================
// REGISTER SOCKETS
// ==========================
function registerGameSockets(io, adminNamespace, socket) {
  const player = getOrCreatePlayer(socket);

  // Disconnect duplicate sessions
  if (player.socketId && player.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(player.socketId);
    oldSocket?.disconnect(true);
  }

  player.socketId = socket.id;
  players.set(socket.id, player);

  // ==========================
  // JOIN GAME ROOM
  // ==========================
  socket.on("joinRoom", (gameId, callback) => {
    if (!gameId) return;

    socket.join(gameId);
    player.room = gameId;

    const game = getOrInitGame(gameId);
    if (!game.players.includes(player.userId)) game.players.push(player.userId);
    if (!game.hostId) game.hostId = player.userId;

    // Sync ongoing game if started
    if (game.status === "started") {
      socket.emit("game:event", {
        type: "GAME_STARTED",
        gameId,
        pot: game.pot,
        enemies: game.numEnemies,
        status: "started",
      });
    }

    // Notify others & admin
    socket.to(gameId).emit("playerJoined", player);
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

    if (callback) callback({ joined: true, gameStatus: game.status, pot: game.pot, enemies: game.numEnemies });
  });

  // ==========================
  // INIT PLAYER DATA
  // ==========================
  socket.emit("init", {
    self: player,
    players: [...playersByUser.values()].filter((p) => p.room === player.room),
  });

  // ==========================
  // HOST ACTIONS
  // ==========================
  socket.on("host:configureEnemies", ({ gameId, numEnemies }) => {
    if (!gameId || !numEnemies || numEnemies <= 0) return;

    const game = getOrInitGame(gameId);
    game.enemiesConfigured = true;
    game.numEnemies = Number(numEnemies);

    emitGameEvent(io, adminNamespace, gameId, {
      type: "ENEMIES_CONFIGURED",
      enemies: game.numEnemies,
    });

    emitActivity(adminNamespace, {
      type: "ENEMIES_CONFIGURED",
      gameId,
      enemies: game.numEnemies,
    });
  });

  socket.on("host:addToPot", ({ gameId, amount }) => {
    if (!gameId || !amount) return;

    const game = getOrInitGame(gameId);
    game.pot += Number(amount);

    emitGameEvent(io, adminNamespace, gameId, {
      type: "ADMIN_ADD_POT",
      amount,
      newPot: game.pot,
    });

    emitActivity(adminNamespace, {
      type: "ADMIN_ADD_POT",
      gameId,
      amount,
      newPot: game.pot,
    });
  });

  socket.on("host:startGame", ({ gameId, pot = 0 }) => {
    if (!gameId) return;

    const game = getOrInitGame(gameId);
    game.status = "started";
    game.pot = Number(pot) || 0;

    // Emit to players & admin
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

  socket.on("host:endGame", ({ gameId, winnerId, creditedCoins }) => {
    const game = games.get(gameId);
    if (!game) return;

    game.status = "finished";

    emitGameEvent(io, adminNamespace, gameId, {
      type: "GAME_RESULT",
      winnerId,
      creditedCoins,
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
      socket.to(p.room).emit("playerLeft", p.userId);

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

    emitTacticalUpdate(io);
  });
}

module.exports = {
  registerGameSockets,
  games,
};
