const { players, playersByUser, getOrCreatePlayer } = require("./gameState");

// ==========================
// SIMPLE GAME STATE STORE
// =========================
const games = new Map(); 
// gameId => { enemiesConfigured, numEnemies, pot, status }

// ==========================
// EMITTER HELPERS
// =========================
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

const emitActivity = (io,adminNamespace, payload) => {
  io.emit("activity:event", { ...payload, timestamp: Date.now() });
  adminNamespace.emit("activity:event", event); // admin
};

const emitGameEvent = (io,adminNamespace, payload) => {
  // Ensure every payload has gameId
  if (!payload.gameId && payload.room) payload.gameId = payload.room;
  io.emit("game:event", { ...payload, timestamp: Date.now() });
   adminNamespace.emit("game:event", event); // admin
};

// ==========================
// GAME UTILS
// =========================
const getOrInitGame = (gameId) => {
  if (!games.has(gameId)) {
    const newGame = { enemiesConfigured: false, numEnemies: 0, pot: 0, status: "waiting" };
    games.set(gameId, newGame);
    return newGame;
  }
  return games.get(gameId);
};

// ==========================
// REGISTER SOCKETS
// =========================
function registerGameSockets(io, socket) {
  const player = getOrCreatePlayer(socket);

  // Disconnect old socket if exists
  if (player.socketId && player.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(player.socketId);
    oldSocket?.disconnect(true);
  }

  player.socketId = socket.id;
  players.set(socket.id, player);

  // =========================
  // JOIN GAME ROOM
  // =========================
  socket.on("joinRoom", (gameId) => {
    if (!gameId) return;
    socket.join(gameId);
    player.room = gameId;

    const game = games.get(gameId);
    if (game?.status === "started") {
      socket.emit("game:event", {
        type: "GAME_STARTED",
        gameId,
        pot: game.pot,
        enemies: game.numEnemies,
        status: game.status,
        timestamp: Date.now(),
      });
    }

    // Emit player joined
    socket.to(gameId).emit("playerJoined", player);
    emitGameEvent(io, { type: "PLAYER_JOINED", userId: player.userId, username: player.username, room: gameId, gameId });
    emitActivity(io, { type: "PLAYER_JOINED", userId: player.userId, username: player.username, room: gameId, gameId });
    emitTacticalUpdate(io);
  });

  // =========================
  // INIT EVENT
  // =========================
  socket.emit("init", {
    self: player,
    players: [...playersByUser.values()].filter((p) => p.room === player.room),
  });

  // =========================
  // SOCKET EVENTS
  // =========================

  // Configure enemies
  socket.on("host:configureEnemies", ({ gameId, numEnemies }) => {
    if (!gameId || !numEnemies || numEnemies <= 0) return;

    const game = getOrInitGame(gameId);
    game.enemiesConfigured = true;
    game.numEnemies = numEnemies;

    io.emit("game:event", { type: "ENEMIES_CONFIGURED", gameId, enemies: numEnemies, timestamp: Date.now() });
    emitActivity(io, { type: "ENEMIES_CONFIGURED", gameId, enemies: numEnemies });
  });

  // Start game
  socket.on("host:startGame", ({ gameId, pot = 0 }) => {
    if (!gameId) return;

    const game = getOrInitGame(gameId);
    game.status = "started";
    game.pot = Number(pot) || 0;

    // Force all players in room to join
    players.forEach((p) => {
      if (p.room === gameId) {
        const playerSocket = io.sockets.sockets.get(p.socketId);
        playerSocket?.join(gameId);
      }
    });

    io.emit("game:event", {
      type: "GAME_STARTED",
      gameId,
      status: "started",
      pot: game.pot,
      enemies: game.numEnemies,
      timestamp: Date.now(),
    });

    emitActivity(io, { type: "GAME_STARTED", gameId, pot: game.pot });
  });

  // Add to pot
  socket.on("host:addToPot", ({ gameId, amount }) => {
    const game = getOrInitGame(gameId);
    game.pot += amount;

    io.emit("game:event", { type: "ADMIN_ADD_POT", gameId, amount, newPot: game.pot, timestamp: Date.now() });
    emitActivity(io, { type: "ADMIN_ADD_POT", gameId, amount, newPot: game.pot });
  });

  // End game
  socket.on("host:endGame", ({ gameId, winnerId, creditedCoins }) => {
    const game = games.get(gameId);
    if (!game) return;
    game.status = "finished";

    io.emit("game:event", { type: "GAME_RESULT", gameId, winnerId, creditedCoins, status: "finished", pot: game.pot, timestamp: Date.now() });
    emitActivity(io, { type: "GAME_RESULT", gameId, winnerId, creditedCoins, pot: game.pot });
  });

  // Disconnect
  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (!p) return;

    players.delete(socket.id);
    if (p.room) socket.to(p.room).emit("playerLeft", p.userId);

    emitGameEvent(io, { type: "PLAYER_DISCONNECTED", userId: p.userId, username: p.username, room: p.room, gameId: p.room });
    emitActivity(io, { type: "PLAYER_DISCONNECTED", userId: p.userId, username: p.username, room: p.room, gameId: p.room });
    emitTacticalUpdate(io);
  });
}

module.exports = {
  registerGameSockets,
  emitTacticalUpdate,
  emitActivity,
  emitGameEvent,
  games,
};
