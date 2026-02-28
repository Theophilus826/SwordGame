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

const emitActivity = (io, payload) => {
  io.emit("activity:event", { ...payload, timestamp: Date.now() });
};

const emitGameEvent = (io, payload) => {
  io.emit("game:event", { ...payload, timestamp: Date.now() });
};

// ==========================
// GAME UTILS
// ==========================
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
// ==========================
function registerGameSockets(io, socket) {
  const player = getOrCreatePlayer(socket);

  // Disconnect old socket if exists
  if (player.socketId && player.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(player.socketId);
    oldSocket?.disconnect(true);
  }

  player.socketId = socket.id;
  players.set(socket.id, player);

  if (player.room) socket.join(player.room);

  // INIT EVENT
  socket.emit("init", {
    self: player,
    players: [...playersByUser.values()].filter((p) => p.room === player.room),
  });

  socket.to(player.room).emit("playerJoined", player);
  emitGameEvent(io, { type: "PLAYER_JOINED", userId: player.userId, username: player.username, room: player.room });
  emitActivity(io, { type: "PLAYER_JOINED", userId: player.userId, username: player.username, room: player.room });
  emitTacticalUpdate(io);

  // =========================
  // SOCKET EVENTS
  // =========================

  // Configure enemies
  socket.on("host:configureEnemies", ({ gameId, numEnemies }) => {
    if (!gameId || !numEnemies || numEnemies <= 0) return;

    const game = getOrInitGame(gameId);
    game.enemiesConfigured = true;
    game.numEnemies = numEnemies;

    emitGameEvent(io, { type: "ENEMIES_CONFIGURED", gameId, enemies: numEnemies });
    emitActivity(io, { type: "ENEMIES_CONFIGURED", gameId, enemies: numEnemies });
  });

  // Start game
 // Start game (Frontend triggers, backend handles join + state)
socket.on("host:startGame", ({ gameId, pot = 0 }) => {
  if (!gameId) return;

  const game = getOrInitGame(gameId);

  // Allow start even if enemies not configured
  game.status = "started";
  game.pot = Number(pot) || 0;

  // 🔥 Force all players with matching room to join socket room
  players.forEach((p) => {
    if (p.room === gameId) {
      const playerSocket = io.sockets.sockets.get(p.socketId);
      playerSocket?.join(gameId);
    }
  });

  // Emit ONLY to that game room
  io.to(gameId).emit("game:event", {
    type: "GAME_STARTED",
    gameId,
    status: "started",
    pot: game.pot,
    enemies: game.numEnemies,
    timestamp: Date.now(),
  });

  emitActivity(io, {
    type: "GAME_STARTED",
    gameId,
    pot: game.pot,
  });
});

  // Add to pot
  socket.on("host:addToPot", ({ gameId, amount }) => {
    const game = getOrInitGame(gameId);
    game.pot += amount;

    emitGameEvent(io, { type: "ADMIN_ADD_POT", gameId, amount, newPot: game.pot });
    emitActivity(io, { type: "ADMIN_ADD_POT", gameId, amount, newPot: game.pot });
  });

  // End game
  socket.on("host:endGame", ({ gameId, winnerId, creditedCoins }) => {
    const game = games.get(gameId);
    if (!game) return;
    game.status = "finished";

    emitGameEvent(io, { type: "GAME_RESULT", gameId, winnerId, creditedCoins, status: "finished", pot: game.pot });
    emitActivity(io, { type: "GAME_RESULT", gameId, winnerId, creditedCoins, pot: game.pot });
  });

  // Disconnect
  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (!p) return;

    players.delete(socket.id);
    socket.to(p.room).emit("playerLeft", p.userId);

    emitGameEvent(io, { type: "PLAYER_DISCONNECTED", userId: p.userId, username: p.username, room: p.room });
    emitActivity(io, { type: "PLAYER_DISCONNECTED", userId: p.userId, username: p.username, room: p.room });
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
